import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { AiSearchFilters, AiSearchResponse } from '../../components/ts/Ai';
import { AI_OFFLINE_MESSAGE, AI_SEARCH_EXAMPLES } from '../../components/ts/Ai';
import { GYM_TYPE_LABEL } from '../../components/ts/Gym';

import { AlertModal, EmptyState, GymCard, PageHeader } from '../../components/ui';
import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession } from '../../store/LoginStore';
import { axiosInstance, comma, getErrorMessage, toLevelLabel } from '../../utils/Tool';

/* ============================================================================
   AI 자연어 암장 검색 — POST /ai/search

   [면접 포인트] 이 기능의 핵심은 "LLM이 답을 만들지 않는다"는 점입니다.
   LLM에게는 <자연어 → 검색 조건(JSON)> 변환만 시키고,
   실제 암장 목록은 그 조건으로 DB를 다시 조회해서 만듭니다.

     사용자 문장 ──▶ LLM(FastAPI) ──▶ filters(JSON) ──▶ Spring이 DB 재조회 ──▶ gyms[]

   이렇게 나눈 이유:
     1) 환각(hallucination) 차단 — 존재하지 않는 암장을 지어내는 일이 구조적으로 불가능합니다.
        AI가 엉뚱한 조건을 뽑아도 최악의 결과는 "검색 결과 없음"이지 거짓 정보가 아닙니다.
     2) 검증 가능 — 뽑힌 조건을 화면에 칩으로 보여주므로 사용자가 AI의 해석을 눈으로 확인하고
        틀렸으면 일반 검색으로 넘어가 직접 고칠 수 있습니다.
     3) 비용 — 응답 생성이 아니라 짧은 JSON 추출이라 토큰이 적게 듭니다.

   filters의 필드명을 GET /gym/list의 파라미터와 1:1로 맞춰 둔 덕분에
   "이 조건으로 일반 검색 열기" 버튼을 쿼리스트링 조립만으로 만들 수 있습니다.
============================================================================ */

/** 필터 칩 하나 */
interface FilterChip {
  label: string;
  value: string;
}

export default function AiSearch() {
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();
  const login = GlobalStoreSession((state) => state.login);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiSearchResponse | null>(null);
  /** 결과에 함께 보여줄 "실제로 검색한 문장" (입력창을 지워도 결과 맥락이 남게) */
  const [searched, setSearched] = useState('');

  /* ==================================================================
     검색 실행
  ================================================================== */
  const handleSearch = async (text?: string) => {
    const keyword = (text ?? query).trim();
    if (!keyword) {
      showAlert('찾고 싶은 암장을 문장으로 입력해주세요.', 'error');
      return;
    }

    setLoading(true);
    setResult(null);
    setSearched(keyword);

    try {
      /*
        백엔드 AiCont는 AI 서버가 죽어도 5xx를 내지 않고
        200 + {available:false, message} 를 돌려줍니다.
        그래서 여기서는 catch보다 응답의 available 플래그를 보고 분기하는 게 정상 경로입니다.
      */
      const res = await axiosInstance.post<AiSearchResponse>('/ai/search', { query: keyword });
      setResult(res.data);
    } catch (err) {
      console.error('AI 검색 실패:', err);
      setResult({ available: false, message: getErrorMessage(err, AI_OFFLINE_MESSAGE) });
    } finally {
      setLoading(false);
    }
  };

  /** 예시 문장 클릭 → 입력창을 채우고 바로 검색 */
  const handleExample = (example: string) => {
    setQuery(example);
    handleSearch(example);
  };

  /* ==================================================================
     AI가 뽑은 filters → 사람이 읽을 수 있는 칩

     JSON을 그대로 보여주면 개발자만 이해할 수 있습니다.
     "sido: 서울", "parking: Y" 대신 "지역: 서울", "주차 가능"으로 바꿔서
     사용자가 AI의 해석이 맞는지 직접 검증할 수 있게 합니다.
  ================================================================== */
  const filterChips = useMemo<FilterChip[]>(() => {
    const filters: AiSearchFilters | undefined = result?.filters;
    if (!filters) return [];

    const chips: FilterChip[] = [];

    if (filters.sido) {
      chips.push({
        label: '지역',
        value: `${filters.sido}${filters.sigungu ? ` ${filters.sigungu}` : ''}`,
      });
    } else if (filters.sigungu) {
      chips.push({ label: '지역', value: filters.sigungu });
    }

    if (filters.type !== null && filters.type !== undefined) {
      chips.push({ label: '유형', value: GYM_TYPE_LABEL[filters.type] ?? `유형 ${filters.type}` });
    }

    if (filters.levelMin !== null && filters.levelMin !== undefined &&
        filters.levelMax !== null && filters.levelMax !== undefined) {
      // 0~100 정규화 점수를 "초급" 같은 사람 말로 되돌립니다.
      const minLabel = toLevelLabel(filters.levelMin);
      const maxLabel = toLevelLabel(filters.levelMax);
      chips.push({
        label: '난이도',
        value: minLabel === maxLabel ? minLabel : `${minLabel} ~ ${maxLabel}`,
      });
    }

    if (filters.parking === 'Y') chips.push({ label: '시설', value: '주차 가능' });
    if (filters.shower === 'Y') chips.push({ label: '시설', value: '샤워실' });
    if (filters.locker === 'Y') chips.push({ label: '시설', value: '락커' });
    if (filters.lesson === 'Y') chips.push({ label: '시설', value: '강습 운영' });
    if (filters.keyword) chips.push({ label: '키워드', value: filters.keyword });

    return chips;
  }, [result]);

  /**
   * 추출된 조건을 일반 검색 화면(/gym)의 쿼리스트링으로 변환합니다.
   *
   * filters 필드명이 GET /gym/list 파라미터와 같아서 거의 그대로 옮기면 됩니다.
   * (keyword만 목록 화면에서 word로 부르기 때문에 이름을 바꿔 줍니다)
   */
  const gymListQuery = useMemo(() => {
    const filters = result?.filters;
    if (!filters) return '';

    const params = new URLSearchParams();
    if (filters.keyword) params.set('word', filters.keyword);
    if (filters.sido) params.set('sido', filters.sido);
    if (filters.sigungu) params.set('sigungu', filters.sigungu);
    if (filters.type !== null && filters.type !== undefined) {
      params.set('type', String(filters.type));
    }
    if (filters.levelMin !== null && filters.levelMin !== undefined &&
        filters.levelMax !== null && filters.levelMax !== undefined) {
      params.set('levelMin', String(filters.levelMin));
      params.set('levelMax', String(filters.levelMax));
    }
    if (filters.parking === 'Y') params.set('parking', 'Y');
    if (filters.shower === 'Y') params.set('shower', 'Y');
    if (filters.locker === 'Y') params.set('locker', 'Y');
    if (filters.lesson === 'Y') params.set('lesson', 'Y');

    return params.toString();
  }, [result]);

  /**
   * 찜 토글 — AI 검색 결과에서도 목록과 같은 동작을 제공합니다.
   * (여기서는 비로그인이면 안내만 하고 서버를 호출하지 않습니다)
   */
  const handleToggleFavorite = async (gno: number) => {
    if (!login) {
      showAlert('찜하기는 로그인 후 이용할 수 있습니다.', 'info');
      return;
    }
    try {
      const res = await axiosInstance.post<{ favorite: boolean; count: number }>(
        `/favorite/${gno}`,
      );
      setResult((prev) =>
        prev
          ? {
              ...prev,
              gyms: prev.gyms?.map((gym) =>
                gym.no === gno
                  ? { ...gym, favorite: res.data.favorite, favoriteCnt: res.data.count }
                  : gym,
              ),
            }
          : prev,
      );
    } catch (err) {
      showAlert(getErrorMessage(err, '찜 처리에 실패했습니다.'), 'error');
    }
  };

  /* ================================================================== */

  const offline = result?.available === false;
  const gyms = result?.gyms ?? [];

  return (
    <div className="container section ai_page">
      <PageHeader
        title="AI 암장 검색"
        desc="찾고 싶은 암장을 문장으로 설명해보세요. AI가 조건을 뽑아 실제 데이터에서 찾아드립니다."
        right={
          <Link to="/gym" className="btn btn_dark">
            📋 일반 검색
          </Link>
        }
      />

      {/* ============================ 입력 ============================ */}
      <section className="ai_hero">
        <h3 className="ai_hero_title">
          “<span className="t-primary">서울 강남</span>에서{' '}
          <span className="t-primary">초보자</span>도 할 수 있는 볼더링장,{' '}
          <span className="t-primary">주차</span> 되는 곳”
        </h3>
        <p className="t-sm t-faint mt8">
          이렇게 말하듯 입력하면 됩니다. 지역 · 난이도 · 유형 · 시설 조건을 알아서 해석합니다.
        </p>

        <div className="ai_input_box">
          <textarea
            className="form_textarea"
            placeholder={AI_SEARCH_EXAMPLES[0]}
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              /*
                여러 줄을 칠 일이 거의 없는 입력이라 엔터를 "검색"으로 씁니다.
                줄바꿈이 필요하면 Shift+Enter를 쓰도록 안내합니다.
              */
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSearch();
              }
            }}
            disabled={loading}
          />

          <button
            type="button"
            className="btn btn_primary btn_lg ai_submit"
            onClick={() => handleSearch()}
            disabled={loading}
          >
            {loading ? '분석 중...' : '🤖 AI로 찾기'}
          </button>
        </div>

        <div className="ai_examples">
          <span className="t-xs t-faint">이렇게 물어보세요</span>
          {AI_SEARCH_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="chip"
              onClick={() => handleExample(example)}
              disabled={loading}
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      {/* ============================ 로딩 ============================ */}
      {loading && (
        <div className="ai_loading">
          <span className="spinner" />
          <p className="mt12">AI가 조건을 분석하는 중...</p>
          <p className="t-xs t-faint mt8">
            자연어에서 지역 · 난이도 · 시설 조건을 뽑아 실제 암장 데이터를 조회합니다.
          </p>
        </div>
      )}

      {/* ============================ 결과 ============================ */}
      {!loading && result && (
        <section className="mt32">
          {offline ? (
            /* AI 서버가 꺼져 있을 때: 원인과 실행 방법을 같이 알려줍니다. */
            <div className="card ai_offline">
              <div className="flex center g12">
                <span style={{ fontSize: 26 }}>🔌</span>
                <div>
                  <h4>AI 검색을 사용할 수 없습니다</h4>
                  <p className="t-sm t-faint mt8">{result.message || AI_OFFLINE_MESSAGE}</p>
                </div>
              </div>

              <div className="notice_box mt16">
                <span>💡</span>
                <div>
                  <p className="t-bold">FastAPI 서버 실행 방법</p>
                  <pre className="ai_code mt8">
{`cd climb_fastapi_v1
pip install -r requirements.txt
uvicorn main:app --port 11300 --reload`}
                  </pre>
                  <p className="t-xs t-faint mt8">
                    AI 서버가 없어도 일반 검색은 정상 동작합니다.
                  </p>
                </div>
              </div>

              <div className="actions center">
                <Link to="/gym" className="btn btn_primary">
                  일반 검색으로 찾기
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* ---------- AI가 이해한 조건 ---------- */}
              <div className="card ai_result_head">
                <div className="card_head">
                  <h3 className="card_title">AI가 이해한 검색 조건</h3>
                  {result.fallback && (
                    <span className="badge badge_warn" title="LLM 없이 키워드 규칙으로 해석했습니다">
                      규칙 기반 해석
                    </span>
                  )}
                </div>

                <p className="t-sm t-faint">“{searched}”</p>

                {filterChips.length > 0 ? (
                  <div className="ai_filter_chips">
                    {filterChips.map((chip, index) => (
                      <span key={`${chip.label}-${chip.value}-${index}`} className="ai_filter_chip">
                        <em>{chip.label}</em>
                        {chip.value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="t-sm t-faint mt12">
                    뚜렷한 조건을 찾지 못해 전체 암장에서 추천했습니다.
                  </p>
                )}

                {result.fallback && (
                  <p className="t-xs t-faint mt12">
                    ※ AI 모델 없이 규칙 기반으로 해석했습니다. (LLM 서버 미연결 시 키워드 매칭으로
                    동작합니다)
                  </p>
                )}

                {result.message && <p className="t-sm t-dim mt16">{result.message}</p>}

                {!!result.keywords?.length && (
                  <div className="flex g4 wrap mt12">
                    {result.keywords.map((keyword) => (
                      <span key={keyword} className="badge badge_muted">
                        #{keyword}
                      </span>
                    ))}
                  </div>
                )}

                <div className="actions">
                  <button
                    type="button"
                    className="btn btn_outline btn_sm"
                    onClick={() => navigate(gymListQuery ? `/gym?${gymListQuery}` : '/gym')}
                  >
                    🔍 이 조건으로 일반 검색 열기
                  </button>
                  <span className="t-xs t-faint">조건을 직접 수정하고 싶다면 여기를 누르세요</span>
                </div>
              </div>

              {/* ---------- 결과 목록 ---------- */}
              <div className="result_head mt24">
                <p className="t-sm t-dim">
                  추천 암장 <strong className="t-primary">{comma(gyms.length)}</strong>곳
                </p>
              </div>

              {gyms.length === 0 ? (
                <EmptyState
                  icon="🤖"
                  message="조건에 맞는 암장을 찾지 못했습니다."
                  sub="조건을 조금 더 느슨하게 말해보거나 일반 검색을 이용해보세요."
                  action={
                    <Link to="/gym" className="btn btn_primary">
                      일반 검색으로 찾기
                    </Link>
                  }
                />
              ) : (
                <div className="grid grid_4">
                  {gyms.map((gym) => (
                    <GymCard key={gym.no} gym={gym} onToggleFavorite={handleToggleFavorite} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ==================== 동작 원리 설명 ==================== */}
      <section className="card ai_flow_card mt40">
        <div className="card_head">
          <h3 className="card_title">이 기능은 이렇게 동작합니다</h3>
          <span className="t-xs t-faint">React → Spring Boot → FastAPI → LLM → Oracle</span>
        </div>

        <div className="ai_flow">
          <div className="ai_flow_step">
            <span className="step_no">1</span>
            <strong>자연어 입력</strong>
            <p>“서울 강남 초보자 볼더링 주차”</p>
            <small>사용자는 필터를 하나씩 고를 필요가 없습니다.</small>
          </div>

          <span className="ai_flow_arrow" aria-hidden="true">
            ▶
          </span>

          <div className="ai_flow_step">
            <span className="step_no">2</span>
            <strong>LLM 구조화 출력</strong>
            <p className="mono">
              {'{ sido:"서울", sigungu:"강남구", type:0, levelMin:0, levelMax:39, parking:"Y" }'}
            </p>
            <small>
              FastAPI가 프롬프트로 JSON만 뽑아냅니다. 문장 생성이 아니라 <b>구조화 추출</b>입니다.
            </small>
          </div>

          <span className="ai_flow_arrow" aria-hidden="true">
            ▶
          </span>

          <div className="ai_flow_step">
            <span className="step_no">3</span>
            <strong>검색 조건 변환</strong>
            <p className="mono">GET /gym/list 와 동일한 파라미터</p>
            <small>
              필드명을 목록 API와 1:1로 맞춰 둬서 그대로 재사용됩니다. 난이도는 0~100 정규화 점수.
            </small>
          </div>

          <span className="ai_flow_arrow" aria-hidden="true">
            ▶
          </span>

          <div className="ai_flow_step">
            <span className="step_no">4</span>
            <strong>DB 재조회</strong>
            <p>Spring이 Oracle에서 실제 암장을 조회</p>
            <small>
              결과는 100% 실제 데이터입니다. AI가 암장을 지어낼 수 없는 구조라 환각이 원천 차단됩니다.
            </small>
          </div>
        </div>

        <div className="notice_box tip mt24">
          <span>🧩</span>
          <p>
            <b>AI를 "답변 생성기"가 아니라 "번역기"로 쓴 설계입니다.</b> LLM은 사람 말을 검색 조건으로
            바꾸는 일만 하고, 사실 확인은 DB가 합니다. 덕분에 AI 서버가 꺼져 있어도
            (<code>available:false</code>) 서비스 본체는 멀쩡히 동작합니다.
          </p>
        </div>
      </section>

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
