import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AiLevelReport, AiRecommendItem, AiRecommendResponse } from '../../components/ts/Ai';
import { AI_OFFLINE_MESSAGE, TREND_LABEL } from '../../components/ts/Ai';

import { EmptyState, Loading, PageHeader } from '../../components/ui';
import MyPageNav from './MyPageNav';

import { axiosInstance, comma, getErrorMessage, toLevelClass, toLevelLabel } from '../../utils/Tool';

/* ============================================================================
   AI 실력 분석 리포트  —  /mypage/report      ★ 이 프로젝트의 AI 대표 화면

   GET /ai/level-report     등반일지 기반 실력 분석 (Spring → FastAPI 프록시)
   GET /ai/recommend/gym    분석 결과 기반 맞춤 암장 추천

   ─────────────────────────────────────────────────────────────────────
   [면접 포인트 1] 응답 필드가 snake_case인 이유와 대처

   Spring(/ai/**)은 FastAPI 응답을 변환 없이 그대로 전달하는 프록시입니다.
   파이썬 관례가 snake_case라 next_goal / success_rate 같은 필드가 그대로 옵니다.
   자바(camelCase)와 섞여 보기 불편하지만, AI 응답 스키마가 자주 바뀌는 단계에서는
   중간 변환 코드를 계속 따라 고치는 비용이 더 큽니다.
   그래서 "변환하지 않고 타입으로 명시"하는 쪽을 택했고(components/ts/Ai.ts),
   화면은 그 타입을 그대로 씁니다. 임의로 camelCase로 바꿔 읽으면 값이 undefined가 됩니다.

   [면접 포인트 2] AI 화면의 3가지 실패 상태를 모두 설계했다

   AI 기능은 "되거나 안 되거나"가 아니라 상태가 여러 갈래입니다.
     ① available === false  → FastAPI 서버 자체가 꺼짐 (실행 안내를 보여줌)
     ② fallback === true    → 서버는 살아 있지만 LLM 없이 규칙 기반으로 답함 (배지 표시)
     ③ 데이터 부족          → 분석할 등반일지가 모자람 (일지 작성 유도)
   이걸 구분하지 않고 전부 "분석 실패"로 묶으면 사용자는 무엇을 해야 할지 모릅니다.
   상태마다 "다음에 할 행동"을 같이 제시하는 것이 이 화면의 핵심입니다.

   [실무 팁] 차트 라이브러리 없이 CSS로 점수 막대를 그립니다.
   막대 하나의 본질은 "값/최댓값 × 100%"를 width에 넣는 것뿐이라
   이 정도에 100KB짜리 의존성을 추가할 이유가 없습니다.
============================================================================ */

/** 분석에 필요한 최소 일지 건수 (안내 문구와 판정에 함께 씁니다) */
const MIN_LOGS_FOR_REPORT = 3;

/** 요약 카드 한 칸 */
interface StatCard {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  /** 완등률처럼 0~100 비율이면 막대를 함께 그립니다 */
  ratio?: number;
}

/**
 * 숫자를 안전하게 꺼냅니다.
 *
 * AiReportStats는 인덱스 시그니처(`[key: string]: unknown`)를 갖고 있어
 * 새 필드가 추가돼도 타입이 깨지지 않습니다. 대신 값이 unknown이라
 * 그대로 화면에 쓸 수 없으므로 "숫자일 때만" 통과시키는 헬퍼를 둡니다.
 * (문자열 '12'가 와도 화면이 깨지지 않게 숫자 변환도 함께 시도합니다)
 */
const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
};

export default function LevelReport() {
  /*
    [설계 메모] 이 화면에는 AlertModal이 없습니다.
    조회만 하는 화면이라 "사용자가 확인해야 끝나는 알림"이 필요한 순간이 없고,
    실패 상황은 전부 화면 안에서(오프라인 안내 / 빈 상태) 다음 행동까지 함께 보여줍니다.
    모달로 띄우면 닫은 뒤에 빈 화면만 남아 오히려 막막해집니다.
  */
  const [report, setReport] = useState<AiLevelReport | null>(null);
  const [loading, setLoading] = useState(true);

  const [recommends, setRecommends] = useState<AiRecommendItem[]>([]);
  const [recommendLoading, setRecommendLoading] = useState(true);
  /** 추천 API가 available=false로 응답했는지 (리포트와 별개로 꺼질 수 있습니다) */
  const [recommendOffline, setRecommendOffline] = useState(false);

  /**
   * 체크해 둔 훈련 항목 (화면에서만 쓰는 상태).
   *
   * [설계 메모] 서버에 저장하지 않는 이유
   * 훈련 목록은 분석할 때마다 새로 생성되는 값이라 "3번 항목"이라는 식별자가
   * 다음 분석에서도 같은 의미를 갖지 않습니다. 저장하려면 훈련 항목 테이블이
   * 따로 필요한데, 이 화면의 목적(현재 상태 파악)에는 과한 설계입니다.
   * 지금은 "읽으면서 체크해 보는" 용도로만 두고, 새로고침하면 초기화됩니다.
   */
  const [checked, setChecked] = useState<number[]>([]);

  /* ==================================================================
     분석 + 추천 조회

     [왜 Promise.allSettled 인가]
     두 API는 서로를 기다릴 이유가 없어 동시에 보냅니다(순차로 하면 시간이 더해집니다).
     또 Promise.all과 달리 하나가 실패해도 전체가 무너지지 않습니다.
     "추천은 실패했지만 분석 결과는 정상적으로 보이는" 상태가 가능해야
     사용자가 절반이라도 얻어 갑니다.
  ================================================================== */
  const load = async () => {
    setLoading(true);
    setRecommendLoading(true);

    const [reportRes, recommendRes] = await Promise.allSettled([
      axiosInstance.get<AiLevelReport>('/ai/level-report'),
      axiosInstance.get<AiRecommendResponse>('/ai/recommend/gym'),
    ]);

    if (reportRes.status === 'fulfilled') {
      setReport(reportRes.value.data ?? null);
    } else {
      console.error('AI 실력 분석 조회 실패:', reportRes.reason);
      /*
        네트워크 오류(Spring이 꺼졌거나 500)와 "AI 서버만 꺼짐(available=false)"은 다릅니다.
        전자는 화면이 아무것도 못 받은 상태라 available=false로 흉내 내어
        아래 오프라인 안내를 그대로 재사용합니다.
      */
      setReport({ available: false, message: getErrorMessage(reportRes.reason, AI_OFFLINE_MESSAGE) });
    }
    setLoading(false);

    if (recommendRes.status === 'fulfilled') {
      const data = recommendRes.value.data;
      setRecommends(data?.items ?? []);
      setRecommendOffline(data?.available === false);
    } else {
      console.error('맞춤 암장 추천 조회 실패:', recommendRes.reason);
      setRecommends([]);
      setRecommendOffline(true);
    }
    setRecommendLoading(false);
  };

  useEffect(() => {
    load();
    // 최초 1회만 호출합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 다시 분석 (FastAPI를 켠 뒤 눌러볼 수 있게) */
  const handleRetry = () => {
    setChecked([]);
    load();
  };

  const toggleCheck = (index: number) =>
    setChecked((prev) =>
      prev.includes(index) ? prev.filter((n) => n !== index) : [...prev, index],
    );

  /* ==================================================================
     상태 판정
  ================================================================== */
  const stats = report?.stats;

  /** 분석에 사용된 일지 건수 (없으면 0으로 봅니다) */
  const totalLogs = num(stats?.total_logs) ?? 0;

  /** AI 서버 연결 실패 */
  const offline = report?.available === false;

  /** LLM 없이 규칙 기반으로 계산된 결과 */
  const isFallback = report?.fallback === true;

  /**
   * 데이터 부족 판정.
   * "응답이 비었거나(level/advice 등 내용이 전혀 없음) 일지 건수가 0"이면
   * 분석할 재료가 없는 상태로 봅니다.
   */
  const noContent =
    !report?.level && !report?.advice && !report?.next_goal &&
    (report?.strength?.length ?? 0) === 0 &&
    (report?.training?.length ?? 0) === 0;

  const notEnough = !offline && (totalLogs === 0 || noContent);

  /* ==================================================================
     요약 카드 구성

     [방어적 표시] 있는 값만 카드로 만듭니다.
     AI 응답 스키마는 바뀔 수 있어서 "total_send가 항상 온다"고 가정하면
     어느 날 undefined가 들어와 "NaN개"가 화면에 찍힙니다.
     num()으로 걸러 null이면 카드 자체를 만들지 않습니다.
  ================================================================== */
  const buildCards = (): StatCard[] => {
    if (!stats) return [];
    const cards: StatCard[] = [];

    const successRate = num(stats.success_rate);
    if (successRate !== null) {
      cards.push({
        icon: '🏁',
        label: '완등률',
        value: `${successRate.toFixed(1)}%`,
        ratio: Math.min(100, Math.max(0, successRate)),
      });
    }

    const totalSend = num(stats.total_send);
    if (totalSend !== null) {
      const totalTry = num(stats.total_try);
      cards.push({
        icon: '🧗',
        label: '총 완등',
        value: `${comma(totalSend)}개`,
        sub: totalTry !== null ? `시도 ${comma(totalTry)}회` : undefined,
      });
    }

    const perWeek = num(stats.avg_per_week);
    if (perWeek !== null) {
      cards.push({
        icon: '📅',
        label: '주당 평균',
        value: `${perWeek.toFixed(1)}회`,
        sub: '최근 등반 빈도',
      });
    }

    const maxOrder = num(stats.max_sort_order);
    if (maxOrder !== null) {
      cards.push({
        icon: '🔥',
        label: '최고 난이도',
        // max_grade_code가 없으면 구간 라벨(중급 등)이라도 보여줍니다.
        value: stats.max_grade_code ?? toLevelLabel(maxOrder),
        sub: `정규화 ${maxOrder}점 · ${toLevelLabel(maxOrder)}`,
        ratio: Math.min(100, Math.max(0, maxOrder)),
      });
    }

    const logs = num(stats.total_logs);
    if (logs !== null) {
      cards.push({
        icon: '📘',
        label: '분석한 일지',
        value: `${comma(logs)}건`,
        sub: '최근 기록 기준',
      });
    }

    return cards;
  };

  const cards = buildCards();

  /* ==================================================================
     렌더링
  ================================================================== */

  if (loading) {
    return (
      <div className="container section">
        <Loading message="AI가 등반 기록을 분석하는 중입니다..." />
      </div>
    );
  }

  return (
    <div className="container section my_page">
      <PageHeader
        title="AI 실력 분석"
        desc="등반일지를 바탕으로 현재 수준과 다음 목표를 제안해드립니다."
        right={
          <button type="button" className="btn btn_dark" onClick={handleRetry}>
            ↻ 다시 분석
          </button>
        }
      />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          {/* ================================================================
              상태 ① AI 서버 연결 실패
          ================================================================ */}
          {offline ? (
            <section className="card report_offline">
              <div className="report_offline_icon" aria-hidden="true">🔌</div>
              <h4 className="report_offline_title">AI 서버에 연결할 수 없습니다</h4>
              <p className="report_offline_msg">{report?.message || AI_OFFLINE_MESSAGE}</p>

              {/*
                개발/시연 환경에서 가장 흔한 원인은 FastAPI를 안 켠 것입니다.
                "오류가 났습니다"로 끝내지 않고 해결 방법을 바로 옆에 적어둡니다.
              */}
              <div className="notice_box warn report_offline_guide">
                <span aria-hidden="true">🛠</span>
                <div>
                  <p className="t-bold">FastAPI 서버 실행 방법</p>
                  <p className="t-sm mt8">
                    climb_fastapi_v1 폴더에서 아래 명령으로 AI 서버(11300 포트)를 실행한 뒤
                    &lsquo;다시 분석&rsquo;을 눌러주세요.
                  </p>
                  <code className="report_cmd mono">uvicorn main:app --port 11300</code>
                </div>
              </div>

              <div className="actions center">
                <button type="button" className="btn btn_primary" onClick={handleRetry}>
                  다시 시도
                </button>
                <Link to="/mypage/climblog" className="btn btn_ghost">
                  등반일지 보기
                </Link>
              </div>
            </section>
          ) : notEnough ? (
            /* ================================================================
                상태 ② 분석할 일지가 부족
            ================================================================ */
            <section className="card">
              <EmptyState
                icon="📘"
                message={`등반일지를 ${MIN_LOGS_FOR_REPORT}건 이상 기록하면 분석할 수 있어요`}
                sub="난이도·완등률·컨디션이 쌓여야 의미 있는 추세를 뽑아낼 수 있습니다."
                action={
                  <>
                    <Link to="/mypage/climblog/write" className="btn btn_primary">
                      ✏️ 일지 작성하기
                    </Link>
                    <Link to="/mypage/climblog" className="btn btn_ghost">
                      내 일지 보기
                    </Link>
                  </>
                }
              />
            </section>
          ) : (
            /* ================================================================
                상태 ③ 정상 — 분석 결과 표시
            ================================================================ */
            <>
              {/* ---------------- 추정 레벨 ---------------- */}
              <section className="card report_hero">
                <div className="report_hero_main">
                  <p className="report_hero_label">AI가 추정한 현재 실력</p>
                  <strong className="report_level">{report?.level ?? '분석 중'}</strong>

                  <div className="report_badges">
                    {/* 추세 — UP/FLAT/DOWN 외의 값이 와도 깨지지 않게 기본값을 둡니다 */}
                    {stats?.trend && (
                      <span className={`report_trend ${String(stats.trend).toLowerCase()}`}>
                        {TREND_LABEL[String(stats.trend)] ?? String(stats.trend)}
                      </span>
                    )}

                    {/*
                      [투명성] 규칙 기반 결과임을 숨기지 않습니다.
                      LLM이 쓴 문장과 규칙으로 만든 문장은 품질이 다른데,
                      같은 얼굴로 보여주면 사용자가 결과를 과신하게 됩니다.
                    */}
                    {isFallback && (
                      <span className="badge badge_warn" title="LLM 없이 통계 규칙으로 계산된 결과입니다">
                        규칙 기반 분석
                      </span>
                    )}
                  </div>
                </div>

                {/* 추정 레벨을 난이도 구간 게이지로도 보여줍니다 */}
                {num(stats?.max_sort_order) !== null && (
                  <div className="report_hero_gauge">
                    <div className="report_gauge_track" aria-hidden="true">
                      <span
                        className={`report_gauge_fill ${toLevelClass(num(stats?.max_sort_order) ?? 0)}`}
                        style={{ width: `${Math.min(100, Math.max(0, num(stats?.max_sort_order) ?? 0))}%` }}
                      />
                    </div>
                    <div className="report_gauge_scale" aria-hidden="true">
                      <span>입문</span>
                      <span>초급</span>
                      <span>중급</span>
                      <span>상급</span>
                      <span>고수</span>
                    </div>
                  </div>
                )}
              </section>

              {/* ---------------- 요약 통계 ---------------- */}
              {cards.length > 0 && (
                <section className="report_stats">
                  {cards.map((card) => (
                    <div key={card.label} className="card report_stat">
                      <span className="report_stat_icon" aria-hidden="true">{card.icon}</span>
                      <p className="report_stat_label">{card.label}</p>
                      <strong className="report_stat_value">{card.value}</strong>
                      {card.sub && <p className="report_stat_sub">{card.sub}</p>}
                      {card.ratio !== undefined && (
                        <div className="report_stat_bar" aria-hidden="true">
                          <span style={{ width: `${card.ratio}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* ---------------- 강점 / 약점 ---------------- */}
              {((report?.strength?.length ?? 0) > 0 || (report?.weakness?.length ?? 0) > 0) && (
                <section className="report_cols mt24">
                  <div className="card report_col">
                    <div className="card_head">
                      <h4 className="card_title">💪 강점</h4>
                    </div>
                    {(report?.strength?.length ?? 0) > 0 ? (
                      <ul className="report_list good">
                        {report?.strength?.map((item, index) => (
                          /*
                            [key 선택] 문장 배열이라 안정적인 id가 없습니다.
                            내용이 중복될 수 있어 index를 함께 붙여 유일성을 확보합니다.
                            (목록 순서가 바뀌거나 중간 삽입이 일어나지 않는 정적 목록이라
                             index를 써도 렌더 오류가 생기지 않습니다)
                          */
                          <li key={`${index}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="t-sm t-faint">아직 두드러진 강점을 찾지 못했습니다.</p>
                    )}
                  </div>

                  <div className="card report_col">
                    <div className="card_head">
                      <h4 className="card_title">🎯 보완할 점</h4>
                    </div>
                    {(report?.weakness?.length ?? 0) > 0 ? (
                      <ul className="report_list bad">
                        {report?.weakness?.map((item, index) => (
                          <li key={`${index}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="t-sm t-faint">현재 기록에서는 뚜렷한 약점이 보이지 않습니다.</p>
                    )}
                  </div>
                </section>
              )}

              {/* ---------------- 다음 목표 ---------------- */}
              {report?.next_goal && (
                <section className="report_goal mt24">
                  <span className="report_goal_icon" aria-hidden="true">🏔️</span>
                  <div className="flex1">
                    <p className="report_goal_label">다음 목표</p>
                    <strong className="report_goal_text">{report.next_goal}</strong>
                  </div>
                  <Link to="/mypage/climblog/write" className="btn btn_primary btn_sm">
                    도전 기록하기
                  </Link>
                </section>
              )}

              {/* ---------------- 조언 ---------------- */}
              {report?.advice && (
                <section className="card mt24">
                  <div className="card_head">
                    <h4 className="card_title">🤖 AI 코치의 조언</h4>
                    {isFallback && <span className="t-xs t-faint">규칙 기반 요약</span>}
                  </div>
                  {/* white-space: pre-line → 서버가 \n으로 문단을 나눠 보내도 그대로 살아납니다 */}
                  <p className="report_advice">{report.advice}</p>
                </section>
              )}

              {/* ---------------- 추천 훈련 ---------------- */}
              {(report?.training?.length ?? 0) > 0 && (
                <section className="card mt24">
                  <div className="card_head">
                    <h4 className="card_title">📋 추천 훈련</h4>
                    <span className="t-xs t-faint">
                      {checked.length} / {report?.training?.length ?? 0} 완료
                    </span>
                  </div>

                  <ul className="report_training">
                    {report?.training?.map((item, index) => (
                      <li key={`${index}-${item}`}>
                        <label className={`report_train_item ${checked.includes(index) ? 'done' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked.includes(index)}
                            onChange={() => toggleCheck(index)}
                          />
                          <span className="report_train_no mono">{index + 1}</span>
                          <span className="report_train_text">{item}</span>
                        </label>
                      </li>
                    ))}
                  </ul>

                  <p className="t-xs t-faint mt12">
                    체크는 이 화면에서만 유지됩니다. (훈련 이력은 등반일지에 남겨주세요)
                  </p>
                </section>
              )}
            </>
          )}

          {/* ================================================================
              맞춤 암장 추천 — GET /ai/recommend/gym
              분석이 실패해도 추천은 따로 보여줍니다(부분 성공 허용).
          ================================================================ */}
          <section className="card mt24">
            <div className="card_head">
              <h4 className="card_title">📍 맞춤 암장 추천</h4>
              <Link to="/gym" className="btn_link t-sm">
                전체 암장 보기 →
              </Link>
            </div>

            {recommendLoading ? (
              <Loading message="맞춤 암장을 고르는 중입니다..." />
            ) : recommendOffline ? (
              <EmptyState
                icon="🔌"
                message="추천을 가져오지 못했습니다."
                sub={AI_OFFLINE_MESSAGE}
                action={
                  <button type="button" className="btn btn_ghost" onClick={handleRetry}>
                    다시 시도
                  </button>
                }
              />
            ) : recommends.length === 0 ? (
              <EmptyState
                icon="📍"
                message="추천할 암장을 찾지 못했습니다."
                sub="등반일지와 선호 지역을 채우면 더 정확한 추천을 받을 수 있어요."
                action={
                  <Link to="/mypage/edit" className="btn btn_ghost">
                    선호 지역 설정하기
                  </Link>
                }
              />
            ) : (
              <ul className="report_rec">
                {recommends.map((item, index) => {
                  /* 점수는 0~100으로 가정하되, 범위를 벗어난 값이 와도 막대가 깨지지 않게 잘라냅니다 */
                  const score = Math.min(100, Math.max(0, item.score ?? 0));
                  return (
                    <li key={item.no} className="report_rec_item">
                      <span className="report_rec_rank mono" aria-hidden="true">
                        {index + 1}
                      </span>

                      <div className="report_rec_body">
                        <div className="report_rec_head">
                          {/* 이름을 누르면 암장 상세로 — 추천을 보고 바로 찾아갈 수 있어야 합니다 */}
                          <Link to={`/gym/${item.no}`} className="report_rec_name">
                            {item.name}
                          </Link>
                          <span className="report_rec_score mono">{score.toFixed(0)}점</span>
                        </div>

                        {/* 추천 점수 막대 (CSS 프로그레스 바) */}
                        <div
                          className="report_rec_bar"
                          role="img"
                          aria-label={`${item.name} 추천 점수 ${score.toFixed(0)}점`}
                        >
                          <span className="report_rec_fill" style={{ width: `${score}%` }} />
                        </div>

                        {item.reason && <p className="report_rec_reason">{item.reason}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
