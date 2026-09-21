import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import type { ClimbLogType, ClimbLogStatsType } from '../../components/ts/ClimbLog';
import { CLIMB_TYPE_LABEL, CONDITION_LABEL } from '../../components/ts/ClimbLog';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  EmptyState,
  GradeBadge,
  Loading,
  PageHeader,
  Pagination,
} from '../../components/ui';
import MyPageNav from './MyPageNav';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, getErrorMessage, getToday, toLevelClass } from '../../utils/Tool';

/* ============================================================================
   등반일지 목록 + 통계 — /mypage/climblog

   GET    /climblog/stats                  통계 (월별 추이 / 난이도 분포 포함)
   GET    /climblog/my?from&to&page&size    목록
   DELETE /climblog/{no}                    삭제

   ─────────────────────────────────────────────────────────────────────
   [면접 포인트] 차트 라이브러리를 쓰지 않고 CSS로 직접 그린 이유
   ─────────────────────────────────────────────────────────────────────
   1) 번들 크기 대비 효용
      Chart.js는 gzip 기준 60KB, Recharts는 d3 의존성까지 포함해 100KB가 넘습니다.
      여기서 필요한 것은 "막대 12개와 가로 바 몇 줄"뿐입니다.
      이 정도를 위해 첫 화면 로딩에 100KB를 더하는 건 손해입니다.

   2) 디자인 일관성
      차트 라이브러리는 자체 색/폰트/툴팁 체계를 갖고 있어서,
      이 프로젝트의 CSS 변수(--primary, --level_tag 색상 등)에 맞추려면
      오히려 커스터마이징 옵션을 뒤지는 시간이 더 듭니다.
      직접 그리면 기존 디자인 토큰을 그대로 씁니다.

   3) 구현 원리가 단순함
      막대그래프의 본질은 "값 / 최댓값 × 100%"를 height에 넣는 것입니다.
      데이터가 수천 건이거나 확대/툴팁/애니메이션 같은 인터랙션이 필요하면
      그때는 라이브러리가 맞습니다. 판단 기준은 "요구사항의 복잡도"입니다.

   [실무 팁] 접근성
   CSS 막대는 스크린리더가 읽을 수 없으므로 aria-label로 수치를 함께 제공하고,
   막대 아래에 숫자도 텍스트로 표시했습니다.
============================================================================ */

/** 기간 필터 프리셋. enum 금지(erasableSyntaxOnly)라 as const 배열을 씁니다. */
const PERIOD_PRESETS = [
  { key: '1m', label: '최근 1개월', months: 1 },
  { key: '3m', label: '최근 3개월', months: 3 },
  { key: '6m', label: '최근 6개월', months: 6 },
  { key: 'all', label: '전체', months: 0 },
] as const;

/**
 * 오늘로부터 N개월 전 날짜를 'yyyy-MM-dd'로 반환합니다.
 *
 * Date 객체의 setMonth는 "3월 31일에서 1개월 전"처럼 일수가 안 맞는 경우
 * 자동으로 다음 달로 넘겨버립니다(2월 31일 → 3월 3일).
 * 통계 기간 필터에서는 며칠 차이가 문제되지 않으므로 그대로 사용하되,
 * 이런 특성이 있다는 점은 알고 쓰는 것이 좋습니다.
 */
const monthsAgo = (months: number): string => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 분 → "3시간 20분" 형태로 변환 */
const toHourText = (minutes?: number): string => {
  const total = minutes ?? 0;
  if (total <= 0) return '0시간';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
};

export default function ClimbLogList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, setPage } = usePaging({ basePath: '/mypage/climblog' });
  const { alert, showAlert, closeAlert } = useAlert();

  /* 기간 조건은 URL에 둡니다 — 뒤로가기/새로고침/공유에서 유지되도록 (GymList와 같은 규약) */
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const [stats, setStats] = useState<ClimbLogStatsType | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [data, setData] = useState<PageResponse<ClimbLogType>>(EMPTY_PAGE<ClimbLogType>(PAGE_SIZE));
  const [listLoading, setListLoading] = useState(true);

  /* 삭제 대상 (null이면 모달 닫힘) */
  const [deleteTarget, setDeleteTarget] = useState<ClimbLogType | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ==================================================================
     통계 조회 — GET /climblog/stats

     통계는 "전체 기간" 기준이라 기간 필터와 무관합니다.
     그래서 목록과 분리해 최초 1회(삭제 후 1회)만 조회합니다.
  ================================================================== */
  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await axiosInstance.get<ClimbLogStatsType>('/climblog/stats');
      setStats(res.data);
    } catch (err) {
      // 통계가 실패해도 목록은 보여줘야 하므로 화면을 막지 않습니다.
      console.error('등반 통계 조회 실패:', err);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ==================================================================
     목록 조회 — GET /climblog/my?from&to&page&size
  ================================================================== */
  const queryKey = searchParams.toString();

  const loadList = async () => {
    setListLoading(true);
    try {
      /* 빈 값은 파라미터에서 빼서 보냅니다("from=" 이 가면 서버가 빈 문자열로 검색할 수 있음) */
      const params: Record<string, string | number> = {
        page: page - 1, // 서버 0부터 / 화면 1부터
        size: PAGE_SIZE,
      };
      if (from) params.from = from;
      if (to) params.to = to;

      const res = await axiosInstance.get<PageResponse<ClimbLogType>>('/climblog/my', { params });
      setData(res.data ?? EMPTY_PAGE<ClimbLogType>(PAGE_SIZE));
    } catch (err) {
      console.error('등반일지 목록 조회 실패:', err);
      setData(EMPTY_PAGE<ClimbLogType>(PAGE_SIZE));
      showAlert(getErrorMessage(err, '등반일지를 불러오지 못했습니다.'), 'error');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    // queryKey 하나로 "기간 + 페이지" 변경을 모두 감지합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  /* ==================================================================
     기간 필터
  ================================================================== */

  /** from/to를 주소창에 반영 (조건이 바뀌면 1페이지로) */
  const applyPeriod = (nextFrom: string, nextTo: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextFrom) next.set('from', nextFrom);
      else next.delete('from');
      if (nextTo) next.set('to', nextTo);
      else next.delete('to');
      next.delete('page');
      return next;
    });
  };

  /** 프리셋 버튼 */
  const handlePreset = (months: number) => {
    if (months === 0) applyPeriod('', ''); // 전체
    else applyPeriod(monthsAgo(months), getToday());
  };

  /** 현재 선택된 프리셋 키 (버튼 활성화 표시용) */
  const activePreset = useMemo(() => {
    if (!from && !to) return 'all';
    // 직접 지정과 구분하기 위해 "to가 오늘이고 from이 프리셋과 일치"할 때만 프리셋으로 봅니다.
    if (to !== getToday()) return '';
    const matched = PERIOD_PRESETS.find((p) => p.months > 0 && monthsAgo(p.months) === from);
    return matched?.key ?? '';
  }, [from, to]);

  /* ==================================================================
     삭제 — DELETE /climblog/{no}
  ================================================================== */
  const handleDelete = async () => {
    if (!deleteTarget?.no) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/climblog/${deleteTarget.no}`);
      setDeleteTarget(null);

      showAlert('등반일지가 삭제되었습니다.', 'success', () => {
        /* 일지가 사라지면 통계 수치도 바뀌므로 통계까지 함께 다시 받습니다. */
        loadStats();
        if (data.content.length === 1 && page > 1) setPage(page - 1);
        else loadList();
      });
    } catch (err) {
      setDeleteTarget(null);
      showAlert(getErrorMessage(err, '삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ==================================================================
     월별 추이 그래프 데이터 가공

     [왜 useMemo인가]
     최댓값을 구하려면 매번 배열을 순회해야 하는데,
     목록 페이지를 넘길 때마다 같은 계산을 반복할 이유가 없습니다.
     stats가 바뀔 때만 계산합니다.
  ================================================================== */
  const monthlyChart = useMemo(() => {
    const monthly = stats?.monthly ?? [];
    if (monthly.length === 0) return { rows: [], maxCnt: 0 };

    /*
      막대 높이 = logCnt / maxCnt × 100%.
      maxCnt가 0이면 0으로 나누게 되므로 최소 1로 보정합니다.
      (전부 0건인 달만 있는 경우 — 실제로는 거의 없지만 방어합니다)
    */
    const maxCnt = Math.max(1, ...monthly.map((m) => m.logCnt));

    return {
      maxCnt,
      rows: monthly.map((m) => ({
        ...m,
        /* 값이 1이라도 막대가 보이도록 최소 높이 6%를 줍니다(0건은 0%). */
        heightPct: m.logCnt > 0 ? Math.max(6, Math.round((m.logCnt / maxCnt) * 100)) : 0,
        /* 최고 난이도 점의 세로 위치 — 0~100점을 그대로 %로 씁니다. */
        gradeDotPct: Math.min(100, Math.max(0, m.maxSortOrder)),
        /* 'yyyy-MM' → 'M월' (축 라벨을 짧게) */
        shortLabel: `${Number(m.yearMonth.substring(5, 7))}월`,
      })),
    };
  }, [stats]);

  /* 난이도별 분포 — 완등 수가 많은 순으로, 비율 바에 쓸 최댓값도 함께 계산 */
  const gradeChart = useMemo(() => {
    const list = stats?.gradeDistribution ?? [];
    if (list.length === 0) return { rows: [], maxSend: 0 };

    const maxSend = Math.max(1, ...list.map((g) => g.sendCnt));
    const rows = [...list].sort((a, b) => b.sendCnt - a.sendCnt);
    return { rows, maxSend };
  }, [stats]);

  /** 통계가 전부 0이면 "아직 기록이 없다"로 봅니다. */
  const hasStats = (stats?.totalLogs ?? 0) > 0;

  return (
    <div className="container section my_page">
      <PageHeader
        title="등반일지"
        desc="기록이 쌓일수록 내 성장이 보입니다."
        right={
          <Link to="/mypage/climblog/write" className="btn btn_primary">
            ✏️ 일지 작성
          </Link>
        }
      />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          {/* ================================================================
              1. 통계 카드
          ================================================================ */}
          {statsLoading ? (
            <Loading message="통계를 계산하는 중입니다..." />
          ) : !hasStats ? (
            <div className="card">
              <EmptyState
                icon="📘"
                message="아직 등반 기록이 없습니다."
                sub="일지를 3건 이상 쌓으면 월별 추이와 AI 실력 분석을 볼 수 있어요."
                action={
                  <Link to="/mypage/climblog/write" className="btn btn_primary">
                    첫 일지 작성하기
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              <section className="log_stat_grid">
                <div className="card log_stat">
                  <p className="log_stat_label">총 등반일수</p>
                  <strong className="log_stat_value">
                    {comma(stats?.totalDays)}
                    <em>일</em>
                  </strong>
                  <p className="log_stat_sub">일지 {comma(stats?.totalLogs)}건</p>
                </div>

                <div className="card log_stat">
                  <p className="log_stat_label">총 완등</p>
                  <strong className="log_stat_value">
                    {comma(stats?.totalSend)}
                    <em>개</em>
                  </strong>
                  <p className="log_stat_sub">시도 {comma(stats?.totalTry)}회</p>
                </div>

                <div className="card log_stat">
                  <p className="log_stat_label">완등률</p>
                  <strong className="log_stat_value t-primary">
                    {(stats?.successRate ?? 0).toFixed(1)}
                    <em>%</em>
                  </strong>
                  {/* 완등률을 가로 바로도 보여줍니다 (숫자보다 직관적) */}
                  <div className="log_rate_bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, stats?.successRate ?? 0)}%` }} />
                  </div>
                </div>

                <div className="card log_stat">
                  <p className="log_stat_label">최고 난이도</p>
                  <div className="log_stat_badge">
                    {stats?.maxGradeCode ? (
                      <GradeBadge
                        system={stats.maxGradeSystem}
                        code={stats.maxGradeCode}
                        sortOrder={stats.maxSortOrder}
                        showLevel
                      />
                    ) : (
                      <span className="t-faint t-sm">기록 없음</span>
                    )}
                  </div>
                  <p className="log_stat_sub">정규화 {stats?.maxSortOrder ?? 0}점</p>
                </div>

                <div className="card log_stat">
                  <p className="log_stat_label">최근 30일</p>
                  <strong className="log_stat_value">
                    {comma(stats?.recent30Days)}
                    <em>회</em>
                  </strong>
                  <p className="log_stat_sub">최근 한 달 등반 횟수</p>
                </div>

                <div className="card log_stat">
                  <p className="log_stat_label">총 운동시간</p>
                  <strong className="log_stat_value">
                    {Math.floor((stats?.totalDurationMin ?? 0) / 60)}
                    <em>시간</em>
                  </strong>
                  <p className="log_stat_sub">{toHourText(stats?.totalDurationMin)}</p>
                </div>
              </section>

              {/* ================================================================
                  2. 월별 추이 그래프 (CSS 막대그래프)
              ================================================================ */}
              {monthlyChart.rows.length > 0 && (
                <section className="card mt24">
                  <div className="card_head">
                    <h4 className="card_title">월별 등반 추이</h4>
                    <span className="t-xs t-faint">막대 = 등반 횟수 · 점 = 그 달의 최고 난이도</span>
                  </div>

                  <div className="log_chart">
                    {/*
                      가로 기준선 4개. 눈금이 없으면 막대 높이를 눈대중으로만 비교하게 됩니다.
                      순수 장식이라 스크린리더에서는 숨깁니다.
                    */}
                    <div className="log_chart_grid" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>

                    <div className="log_chart_bars">
                      {monthlyChart.rows.map((row) => (
                        <div
                          key={row.yearMonth}
                          className="log_bar_col"
                          /* 스크린리더용 — 막대는 시각 정보라 수치를 말로 제공합니다. */
                          aria-label={`${row.yearMonth} 등반 ${row.logCnt}회, 완등 ${row.sendCnt}개, 최고 난이도 ${row.maxLevelLabel ?? '없음'}`}
                          title={`${row.yearMonth}\n등반 ${row.logCnt}회 / 완등 ${row.sendCnt}개`}
                        >
                          <span className="log_bar_cnt">{row.logCnt}</span>

                          <div className="log_bar_track">
                            {/* 막대 본체 — 높이만 인라인 스타일로 계산값을 넣습니다.
                                (색/모양은 CSS, 데이터에 따라 달라지는 값만 인라인) */}
                            <div className="log_bar_fill" style={{ height: `${row.heightPct}%` }} />

                            {/* 그 달의 최고 난이도 점 — 세로 위치가 곧 난이도 점수입니다. */}
                            {row.maxSortOrder > 0 && (
                              <span
                                className={`log_bar_dot ${toLevelClass(row.maxSortOrder)}`}
                                style={{ bottom: `${row.gradeDotPct}%` }}
                                title={`최고 난이도 ${row.maxLevelLabel ?? ''} (${row.maxSortOrder}점)`}
                              />
                            )}
                          </div>

                          <span className="log_bar_label">{row.shortLabel}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="t-xs t-faint mt12">
                    난이도 점(●)의 높이는 정규화 점수(0~100)입니다. 점이 점점 위로 올라가면
                    더 어려운 문제를 오르고 있다는 뜻입니다.
                  </p>
                </section>
              )}

              {/* ================================================================
                  3. 난이도별 완등 분포 (가로 막대)
              ================================================================ */}
              {gradeChart.rows.length > 0 && (
                <section className="card mt24">
                  <div className="card_head">
                    <h4 className="card_title">난이도별 완등 분포</h4>
                    <span className="t-xs t-faint">완등 수 기준</span>
                  </div>

                  <ul className="log_grade_dist">
                    {gradeChart.rows.map((row) => (
                      <li key={`${row.gradeSystem}-${row.gradeCode}-${row.sortOrder}`}>
                        <span className="log_grade_badge">
                          <GradeBadge
                            system={row.gradeSystem}
                            code={row.gradeCode}
                            sortOrder={row.sortOrder}
                          />
                        </span>

                        <span className="log_grade_bar">
                          <span
                            className={`log_grade_fill ${toLevelClass(row.sortOrder)}`}
                            style={{
                              width: `${Math.max(3, (row.sendCnt / gradeChart.maxSend) * 100)}%`,
                            }}
                          />
                        </span>

                        <span className="log_grade_cnt">
                          <strong>{comma(row.sendCnt)}</strong>
                          <em className="t-faint"> / {comma(row.logCnt)}회</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {/* ================================================================
              4. 기간 필터 + 목록
          ================================================================ */}
          <section className="card mt24">
            <div className="card_head">
              <h4 className="card_title">일지 목록</h4>
              <span className="t-xs t-faint">총 {comma(data.totalElements)}건</span>
            </div>

            {/* ---------- 기간 필터 ---------- */}
            <div className="log_period">
              <div className="chip_group">
                {PERIOD_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={`chip ${activePreset === preset.key ? 'on' : ''}`}
                    onClick={() => handlePreset(preset.months)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="log_period_range">
                <input
                  type="date"
                  className="form_input"
                  value={from}
                  max={to || getToday()}
                  onChange={(e) => applyPeriod(e.target.value, to)}
                  aria-label="시작일"
                />
                <span className="t-faint">~</span>
                <input
                  type="date"
                  className="form_input"
                  value={to}
                  min={from}
                  max={getToday()}
                  onChange={(e) => applyPeriod(from, e.target.value)}
                  aria-label="종료일"
                />
                {(from || to) && (
                  <button
                    type="button"
                    className="btn btn_ghost btn_sm"
                    onClick={() => applyPeriod('', '')}
                  >
                    ↺ 초기화
                  </button>
                )}
              </div>
            </div>

            {/* ---------- 목록 ---------- */}
            {listLoading ? (
              <Loading message="일지를 불러오는 중입니다..." />
            ) : data.content.length === 0 ? (
              <EmptyState
                icon="🗓️"
                message={from || to ? '이 기간에 기록된 일지가 없습니다.' : '등반일지가 없습니다.'}
                sub={from || to ? '기간을 넓혀서 다시 확인해보세요.' : '오늘 다녀온 암장을 기록해보세요.'}
                action={
                  from || to ? (
                    <button
                      type="button"
                      className="btn btn_primary"
                      onClick={() => applyPeriod('', '')}
                    >
                      기간 초기화
                    </button>
                  ) : (
                    <Link to="/mypage/climblog/write" className="btn btn_primary">
                      일지 작성하기
                    </Link>
                  )
                }
              />
            ) : (
              <>
                <ul className="log_list">
                  {data.content.map((log) => (
                    <li key={log.no} className="log_item">
                      {/* ---------- 좌측: 날짜 ---------- */}
                      <div className="log_item_date">
                        <strong className="mono">{log.logDate?.substring(5) ?? ''}</strong>
                        <span className="t-xs t-faint">{log.logDate?.substring(0, 4)}</span>
                      </div>

                      {/* ---------- 본문 ---------- */}
                      <div className="log_item_body">
                        <div className="flex center g8 wrap">
                          <strong className="log_item_gym">
                            {/* gno가 있으면 암장 상세로, 직접 입력(gymName)이면 텍스트만 */}
                            {log.gno ? (
                              <Link to={`/gym/${log.gno}`}>{log.gname ?? log.gymName}</Link>
                            ) : (
                              (log.gymName ?? '암장 미지정')
                            )}
                          </strong>

                          <span className="badge badge_muted">
                            {CLIMB_TYPE_LABEL[log.climbType]}
                          </span>

                          {log.gradeCode && (
                            <GradeBadge
                              system={log.gradeSystem}
                              code={log.gradeCode}
                              sortOrder={log.sortOrder}
                              showLevel
                            />
                          )}
                        </div>

                        <div className="log_item_meta">
                          <span>
                            시도 <strong>{log.tryCnt ?? 0}</strong> · 완등{' '}
                            <strong className="t-primary">{log.sendCnt ?? 0}</strong>
                          </span>
                          <span>⏱ {toHourText(log.durationMin)}</span>
                          <span>
                            컨디션 {CONDITION_LABEL[log.conditionScore ?? 3] ?? '보통'}
                            {/* 컨디션을 점으로도 표현 — 숫자보다 빨리 읽힙니다. */}
                            <em className="log_condition" aria-hidden="true">
                              {'●'.repeat(log.conditionScore ?? 3)}
                              {'○'.repeat(5 - (log.conditionScore ?? 3))}
                            </em>
                          </span>
                        </div>

                        {log.memo && <p className="log_item_memo">{log.memo}</p>}
                      </div>

                      {/* ---------- 우측: 수정 / 삭제 ---------- */}
                      <div className="log_item_actions">
                        <button
                          type="button"
                          className="btn btn_dark btn_xs"
                          onClick={() => navigate(`/mypage/climblog/${log.no}/edit`)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="btn btn_ghost btn_xs"
                          onClick={() => setDeleteTarget(log)}
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
              </>
            )}
          </section>
        </div>
      </div>

      {/* ==================== 모달 ==================== */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {deleteTarget && (
        <ConfirmModal
          title="등반일지 삭제"
          message={`${deleteTarget.logDate} · ${
            deleteTarget.gname ?? deleteTarget.gymName ?? '암장 미지정'
          } 일지를 삭제할까요?\n삭제하면 통계에서도 제외되며 되돌릴 수 없습니다.`}
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
