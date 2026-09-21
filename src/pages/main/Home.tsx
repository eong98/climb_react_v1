import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { GymType } from '../../components/ts/Gym';
import { GYM_TYPE_OPTIONS } from '../../components/ts/Gym';
import type { BoardType } from '../../components/ts/Board';
import type { ProductType } from '../../components/ts/Shop';

import { GymCard, ProductCard, SkeletonCards } from '../../components/ui';
import {
  axiosInstance, LEVEL_RANGES, onEnter, shortCount, toRelativeTime,
} from '../../utils/Tool';

/* ============================================================================
   메인 페이지

   [화면 구성]
   히어로(통합검색) → 유형 퀵필터 → 난이도 퀵필터 → 인기 암장 → 신규 암장
   → 인기 커뮤니티 글 → 베스트 상품 → 서비스 소개

   [설계 의도]
   메인은 "무엇을 할 수 있는 서비스인지"를 3초 안에 보여주고,
   바로 다음 행동(검색/필터)으로 넘어가게 만드는 것이 목적입니다.
   그래서 검색창을 가장 위에 크게 두고, 그 아래를 전부 "한 번의 클릭으로
   검색 결과로 이동하는 바로가기"로 채웠습니다.
============================================================================ */

/** 히어로 검색창 아래에 노출할 추천 검색어 (클릭하면 바로 검색) */
const SUGGEST_WORDS = ['강남', '더클라임', '홍대', '볼더링', '자연바위'] as const;

/**
 * Promise.allSettled 결과에서 목록을 꺼냅니다.
 *
 * 실패한 요청은 콘솔에만 남기고 빈 배열로 대체합니다.
 * 이렇게 해야 "베스트 상품 API만 죽었는데 메인 전체가 하얗게 비는" 사고를 막을 수 있습니다.
 */
function unwrap<T>(result: PromiseSettledResult<{ data: T[] }>, label: string): T[] {
  if (result.status === 'fulfilled') {
    return result.value.data ?? [];
  }
  console.error(`[메인] ${label} 조회 실패:`, result.reason);
  return [];
}

export default function Home() {
  const navigate = useNavigate();

  /** 히어로 통합 검색어 (이 값은 화면 안에서만 쓰이므로 로컬 상태로 충분) */
  const [word, setWord] = useState('');

  const [popularGyms, setPopularGyms] = useState<GymType[]>([]);
  const [newGyms, setNewGyms] = useState<GymType[]>([]);
  const [popularBoards, setPopularBoards] = useState<BoardType[]>([]);
  const [bestProducts, setBestProducts] = useState<ProductType[]>([]);

  const [loading, setLoading] = useState(true);
  /** 어떤 섹션이 실패했는지 기억해 두고 그 자리에만 안내를 보여줍니다 */
  const [failed, setFailed] = useState<string[]>([]);

  /* ------------------------------------------------------------------------
     초기 데이터 로딩

     [면접 포인트 ①] 왜 병렬(Promise.allSettled)인가
     await를 네 번 줄줄이 쓰면 (인기암장 200ms) + (신규 200ms) + (인기글 200ms)
     + (상품 200ms) = 800ms 가 그대로 더해집니다. 네 요청은 서로 의존 관계가
     전혀 없으므로 동시에 쏘면 가장 느린 하나(=200ms)만 기다리면 됩니다.

     [면접 포인트 ②] 왜 Promise.all이 아니라 Promise.allSettled인가
     Promise.all은 하나라도 reject되면 즉시 전체가 reject됩니다.
     즉 베스트 상품 API 하나가 500을 뱉으면 인기 암장 데이터가 멀쩡히 도착했어도
     catch로 빠져 메인 전체가 빈 화면이 됩니다.
     allSettled는 모든 요청의 성패를 각각 돌려주므로,
     성공한 섹션은 그대로 그리고 실패한 섹션에만 안내를 띄울 수 있습니다.
     메인처럼 "독립적인 위젯을 여러 개 얹는 화면"에 딱 맞는 방식입니다.
  ------------------------------------------------------------------------ */
  useEffect(() => {
    let alive = true; // 언마운트 후 setState 경고 방지

    const load = async () => {
      const [popularRes, newRes, boardRes, productRes] = await Promise.allSettled([
        axiosInstance.get<GymType[]>('/gym/popular', { params: { size: 8 } }),
        axiosInstance.get<GymType[]>('/gym/new', { params: { size: 4 } }),
        axiosInstance.get<BoardType[]>('/board/popular', { params: { size: 5 } }),
        axiosInstance.get<ProductType[]>('/product/best', { params: { size: 4 } }),
      ]);

      if (!alive) return;

      setPopularGyms(unwrap<GymType>(popularRes, '인기 암장'));
      setNewGyms(unwrap<GymType>(newRes, '신규 암장'));
      setPopularBoards(unwrap<BoardType>(boardRes, '인기 커뮤니티 글'));
      setBestProducts(unwrap<ProductType>(productRes, '베스트 상품'));

      const fails: string[] = [];
      if (popularRes.status === 'rejected') fails.push('popularGym');
      if (newRes.status === 'rejected') fails.push('newGym');
      if (boardRes.status === 'rejected') fails.push('board');
      if (productRes.status === 'rejected') fails.push('product');
      setFailed(fails);

      setLoading(false);
    };

    load();
    return () => { alive = false; };
  }, []);

  /* ------------------------------------------------------------------------
     이동 핸들러
  ------------------------------------------------------------------------ */

  /**
   * 통합 검색 → 암장 검색 결과로 이동.
   * 검색어는 URL 쿼리에 담아 넘깁니다(전역 상태 X).
   * 그래야 "/gym?word=강남" 링크를 그대로 공유하거나 새로고침해도 결과가 유지됩니다.
   */
  const goSearch = (keyword: string) => {
    const trimmed = keyword.trim();
    navigate(trimmed ? `/gym?word=${encodeURIComponent(trimmed)}` : '/gym');
  };

  return (
    <>
      {/* ================================================================
          히어로
      ================================================================ */}
      <section className="home_hero">
        <div className="container">
          <div className="home_hero_inner">
            <span className="home_hero_eyebrow">🧗 전국 실내암장 · 자연바위 통합 검색</span>

            <h1>
              오늘 갈 암장,<br />
              <span className="point">난이도</span>까지 보고 고르세요.
            </h1>

            <p className="home_hero_sub">
              색상 · V등급 · 5.10a 처럼 제각각인 난이도를 하나의 기준으로 정규화했습니다.
              <br />
              내 실력에 맞는 루트가 있는 암장만 골라서 볼 수 있어요.
            </p>

            {/* 통합 검색 */}
            <div className="home_search">
              <div className="home_search_box">
                <span className="icon">🔍</span>
                <input
                  type="search"
                  className="form_input"
                  value={word}
                  placeholder="암장 이름, 지역, 지하철역으로 검색"
                  aria-label="암장 통합 검색"
                  onChange={(e) => setWord(e.target.value)}
                  /* 엔터로도 검색되게 — 검색창에서 버튼을 찾아 누르는 사용자는 드뭅니다 */
                  onKeyDown={(e) => onEnter(e, () => goSearch(word))}
                />
              </div>
              <button type="button" className="btn btn_primary" onClick={() => goSearch(word)}>
                암장 찾기
              </button>
              <Link to="/ai" className="btn btn_dark">
                ✨ AI에게 물어보기
              </Link>
            </div>

            <div className="home_hero_tags">
              <span>추천 검색어</span>
              {SUGGEST_WORDS.map((w) => (
                <button key={w} type="button" className="tag" onClick={() => goSearch(w)}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          암장 유형 퀵 필터
      ================================================================ */}
      <section className="section">
        <div className="container">
          <div className="sec_head">
            <div>
              <h3>어떤 클라이밍을 하시나요?</h3>
              <p className="sub">유형을 고르면 해당 암장만 모아 보여드립니다</p>
            </div>
            <Link to="/gym" className="sec_more">전체 암장 보기 →</Link>
          </div>

          <div className="grid grid_4">
            {GYM_TYPE_OPTIONS.map((opt, i) => (
              <Link key={opt.value} to={`/gym?type=${opt.value}`} className="home_type_card">
                <span className="emoji">{['🧱', '🪢', '🪨', '⛰️'][i]}</span>
                <h4>{opt.label}</h4>
                <p>{opt.desc}</p>
                <span className="go">보러가기 →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          난이도로 찾기

          LEVEL_RANGES의 min/max를 그대로 쿼리로 넘깁니다.
          이 값은 백엔드 SORT_ORDER(0~100)와 같은 기준이므로
          프론트에서 따로 변환할 필요가 없습니다.
      ================================================================ */}
      <section className="section sm">
        <div className="container">
          <div className="home_level_bar">
            <span className="lead">🎯 내 난이도로 찾기</span>
            {LEVEL_RANGES.map((lv) => (
              <Link
                key={lv.label}
                to={`/gym?levelMin=${lv.min}&levelMax=${lv.max}`}
                className={`chip home_level_chip ${lv.cls}`}
              >
                <span className="dot" />
                {lv.label}
                <span className="range">{lv.min}-{lv.max}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          인기 암장
      ================================================================ */}
      <section className="section sm">
        <div className="container">
          <div className="sec_head">
            <div>
              <h3>🔥 지금 인기 있는 암장</h3>
              <p className="sub">평점과 리뷰가 많은 순으로 모았습니다</p>
            </div>
            <Link to="/gym?sort=rating" className="sec_more">더보기 →</Link>
          </div>

          {loading ? (
            <SkeletonCards count={8} />
          ) : failed.includes('popularGym') ? (
            <div className="home_sec_error">인기 암장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
          ) : popularGyms.length === 0 ? (
            <div className="home_sec_error">아직 등록된 암장이 없습니다.</div>
          ) : (
            <div className="grid grid_4">
              {popularGyms.map((gym) => (
                <GymCard key={gym.no} gym={gym} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================================================================
          신규 등록 암장 + 인기 커뮤니티 글 (2:1 분할)

          .grid_split은 1024px 이하에서 자동으로 1열이 됩니다(common.css).
      ================================================================ */}
      <section className="section sm">
        <div className="container">
          <div className="grid grid_split">
            {/* --- 신규 등록 암장 --- */}
            <div>
              <div className="sec_head">
                <div>
                  <h3>🆕 새로 문 연 암장</h3>
                  <p className="sub">최근에 등록된 따끈한 암장</p>
                </div>
                <Link to="/gym?sort=new" className="sec_more">더보기 →</Link>
              </div>

              {loading ? (
                /* SkeletonCards는 4열 그리드 고정이라 이 좁은 영역에서는 카드가 너무 작아집니다.
                   여기서는 실제 배치(2열)와 같은 모양으로 직접 그립니다. */
                <div className="grid grid_2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="card pad0">
                      <div className="skeleton" style={{ width: '100%', aspectRatio: '4 / 3' }} />
                      <div style={{ padding: 16 }}>
                        <div className="skeleton" style={{ height: 16, width: '70%' }} />
                        <div className="skeleton mt8" style={{ height: 13, width: '45%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : failed.includes('newGym') ? (
                <div className="home_sec_error">신규 암장을 불러오지 못했습니다.</div>
              ) : newGyms.length === 0 ? (
                <div className="home_sec_error">아직 신규 등록된 암장이 없습니다.</div>
              ) : (
                <div className="grid grid_2">
                  {newGyms.map((gym) => (
                    <GymCard key={gym.no} gym={gym} />
                  ))}
                </div>
              )}
            </div>

            {/* --- 인기 커뮤니티 글 --- */}
            <div>
              <div className="sec_head">
                <div>
                  <h3>💬 인기 글</h3>
                  <p className="sub">최근 일주일 반응이 뜨거운 글</p>
                </div>
                <Link to="/community" className="sec_more">더보기 →</Link>
              </div>

              {loading ? (
                <div className="card">
                  {/* 리스트용 스켈레톤은 카드형과 모양이 달라 여기서 직접 그립니다 */}
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`skeleton ${i > 0 ? 'mt16' : ''}`} style={{ height: 18 }} />
                  ))}
                </div>
              ) : failed.includes('board') ? (
                <div className="home_sec_error">인기 글을 불러오지 못했습니다.</div>
              ) : popularBoards.length === 0 ? (
                <div className="home_sec_error">아직 등록된 글이 없습니다.</div>
              ) : (
                <div className="card home_rank">
                  {popularBoards.map((post, i) => (
                    <Link key={post.no} to={`/community/${post.no}`} className="home_rank_item">
                      <span className="home_rank_no">{i + 1}</span>
                      <div className="home_rank_body">
                        <p className="tit ellipsis">{post.title}</p>
                        <div className="home_rank_meta">
                          <span>{post.nickname ?? '알 수 없음'}</span>
                          <span>💬 {post.replyCnt ?? 0}</span>
                          <span>👁 {shortCount(post.vcnt)}</span>
                          <span>{toRelativeTime(post.cdate)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          베스트 상품
      ================================================================ */}
      <section className="section sm">
        <div className="container">
          <div className="sec_head">
            <div>
              <h3>🛒 클라이머 베스트 장비</h3>
              <p className="sub">가장 많이 팔린 암벽화 · 초크 · 장비</p>
            </div>
            <Link to="/shop?sort=sell" className="sec_more">스토어 가기 →</Link>
          </div>

          {loading ? (
            <SkeletonCards count={4} />
          ) : failed.includes('product') ? (
            <div className="home_sec_error">베스트 상품을 불러오지 못했습니다.</div>
          ) : bestProducts.length === 0 ? (
            <div className="home_sec_error">아직 등록된 상품이 없습니다.</div>
          ) : (
            <div className="grid grid_4">
              {bestProducts.map((product) => (
                <ProductCard key={product.no} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================================================================
          서비스 소개 3단 배너
      ================================================================ */}
      <section className="section">
        <div className="container">
          <div className="sec_head">
            <div>
              <h3>CLIMB:ON이 하는 일</h3>
              <p className="sub">암장 찾기부터 실력 관리까지 한 곳에서</p>
            </div>
          </div>

          <div className="grid grid_3">
            <div className="home_feature">
              <span className="emoji">🎯</span>
              <h4>난이도 통합 검색</h4>
              <p>
                색상 난이도, V등급, 5.10a, 6b+ 를 0~100 점수로 정규화했습니다.
                체계가 달라도 "내 실력에 맞는 루트가 있는 암장"을 한 번에 걸러냅니다.
              </p>
              <Link to="/gym" className="more">암장 검색하기 →</Link>
            </div>

            <div className="home_feature f2">
              <span className="emoji">📈</span>
              <h4>등반일지 &amp; AI 실력분석</h4>
              <p>
                완등한 루트를 기록하면 난이도 추이와 성공률을 그래프로 보여줍니다.
                AI가 기록을 읽고 다음에 도전할 등급과 보완할 점을 알려줍니다.
              </p>
              <Link to="/mypage/report" className="more">내 실력 분석 →</Link>
            </div>

            <div className="home_feature f3">
              <span className="emoji">🤝</span>
              <h4>커뮤니티</h4>
              <p>
                같이 등반할 파트너를 구하고, 다녀온 암장 후기를 남기고,
                안 쓰는 장비를 거래하세요. 지역별로 모아볼 수 있습니다.
              </p>
              <Link to="/community" className="more">커뮤니티 둘러보기 →</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
