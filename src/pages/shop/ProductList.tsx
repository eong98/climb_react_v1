import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { ProductFilters, ProductType } from '../../components/ts/Shop';
import {
  EMPTY_PRODUCT_FILTERS,
  LEVEL_TAGS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_SORT_OPTIONS,
} from '../../components/ts/Shop';
import type { PageResponse } from '../../components/ts/Api';
import { CARD_PAGE_SIZE, EMPTY_PAGE } from '../../components/ts/Api';

import {
  AlertModal,
  EmptyState,
  PageHeader,
  Pagination,
  ProductCard,
  SearchBar,
  SkeletonCards,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, getErrorMessage, onEnter, won } from '../../utils/Tool';

/* ============================================================================
   스토어 상품 목록 — GET /product/list

   [면접 포인트 ①] 검색 조건을 useState가 아니라 URL 쿼리(useSearchParams)에 둡니다.
     - 메인 화면에서 "/shop?category=0"(암벽화), "/shop?sort=sell"(베스트) 같은
       딥링크로 들어오는 동선이 실제로 존재합니다. 조건을 useState에 두면
       진입 파라미터를 따로 파싱해 초기화하는 코드를 또 짜야 하고,
       그 둘이 어긋나면 "주소는 암벽화인데 화면은 전체"인 버그가 납니다.
     - 상품 카드를 눌러 상세로 갔다가 뒤로가기 하면 보던 조건/페이지로 정확히 복귀합니다.
     - 새로고침·링크 공유에도 화면이 100% 복원됩니다.
     즉 "URL이 검색 조건의 단일 진실 공급원(single source of truth)"입니다.

   [면접 포인트 ②] draft / applied 2단 패턴
     - 검색어·가격처럼 **타이핑이 필요한 입력**은 로컬 state(draft)에만 담고,
       엔터/버튼을 눌렀을 때만 URL(applied)로 승격시킵니다.
       한 글자마다 서버를 때리면 "스카르파"를 치는 동안 요청이 4번 날아갑니다.
     - 반대로 카테고리 칩·레벨 칩·정렬 select는 **한 번의 클릭으로 끝나는 조작**이라
       즉시 URL에 반영해 바로 결과를 보여줍니다.
       (클릭하고 또 검색 버튼을 눌러야 하면 답답한 UI가 됩니다)
     기준은 "입력 비용이 큰 것은 지연 반영, 클릭 한 번이면 즉시 반영"입니다.
============================================================================ */

/** 가격 입력창(최소/최대)의 draft 상태 */
interface PriceDraft {
  min: string;
  max: string;
}

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, setPage } = usePaging({ basePath: '/shop' });
  const { alert, showAlert, closeAlert } = useAlert();

  /* ------------------------------------------------------------------
     적용된(applied) 검색 조건 — 주소창에서 읽습니다.

     useMemo를 쓰는 이유: searchParams가 바뀔 때만 객체를 새로 만들어
     아래 useEffect 의존성이 불필요하게 요동치지 않게 하기 위해서입니다.
  ------------------------------------------------------------------ */
  const filters: ProductFilters = useMemo(
    () => ({
      ...EMPTY_PRODUCT_FILTERS,
      word: searchParams.get('word') ?? '',
      category: searchParams.get('category') ?? '',
      brand: searchParams.get('brand') ?? '',
      levelTag: searchParams.get('levelTag') ?? '',
      priceMin: searchParams.get('priceMin') ?? '',
      priceMax: searchParams.get('priceMax') ?? '',
      sort: searchParams.get('sort') ?? 'new',
    }),
    [searchParams],
  );

  /* 텍스트/가격 입력값(draft) — 적용값과 분리해서 관리합니다. */
  const [draftWord, setDraftWord] = useState(filters.word);
  const [draftPrice, setDraftPrice] = useState<PriceDraft>({
    min: filters.priceMin,
    max: filters.priceMax,
  });

  /**
   * 주소창 값이 바뀌면 입력창도 맞춰 줍니다.
   * (뒤로가기로 이전 조건으로 돌아왔는데 입력창만 최신 글자를 들고 있으면 어색합니다)
   */
  useEffect(() => {
    setDraftWord(filters.word);
  }, [filters.word]);

  useEffect(() => {
    setDraftPrice({ min: filters.priceMin, max: filters.priceMax });
  }, [filters.priceMin, filters.priceMax]);

  /* 목록 데이터 */
  const [data, setData] = useState<PageResponse<ProductType>>(
    EMPTY_PAGE<ProductType>(CARD_PAGE_SIZE),
  );
  const [loading, setLoading] = useState(true);

  /* 모바일에서 필터 접기/펼치기 (데스크톱은 CSS로 항상 펼침) */
  const [filterOpen, setFilterOpen] = useState(false);

  /* ==================================================================
     목록 조회 — GET /product/list
  ================================================================== */

  /** 주소창 쿼리 문자열. 이 값이 바뀔 때만 다시 조회하면 중복 호출이 없습니다. */
  const queryKey = searchParams.toString();

  useEffect(() => {
    const loadList = async () => {
      setLoading(true);
      try {
        /*
          빈 값은 파라미터에서 아예 빼서 보냅니다.
          "category=" 처럼 빈 문자열이 가면 서버가 ""를 조건으로 해석할 수 있어
          "조건 없음"과 "빈 문자열 조건"이 헷갈립니다.
        */
        const params: Record<string, string | number> = {
          page: page - 1, // 서버는 0부터, 화면은 1부터
          size: CARD_PAGE_SIZE,
          sort: filters.sort,
        };
        if (filters.word) params.word = filters.word;
        if (filters.category) params.category = filters.category;
        if (filters.brand) params.brand = filters.brand;
        if (filters.levelTag) params.levelTag = filters.levelTag;
        if (filters.priceMin) params.priceMin = filters.priceMin;
        if (filters.priceMax) params.priceMax = filters.priceMax;

        const res = await axiosInstance.get<PageResponse<ProductType>>('/product/list', { params });
        setData(res.data ?? EMPTY_PAGE<ProductType>(CARD_PAGE_SIZE));
      } catch (err) {
        console.error('상품 목록 조회 실패:', err);
        setData(EMPTY_PAGE<ProductType>(CARD_PAGE_SIZE));
        showAlert(getErrorMessage(err, '상품 목록을 불러오지 못했습니다.'), 'error');
      } finally {
        setLoading(false);
      }
    };
    loadList();
    // queryKey 하나로 "필터 + 페이지" 변경을 모두 감지합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  /* ==================================================================
     필터 조작
  ================================================================== */

  /**
   * 필터 일부를 바꿔 주소창에 반영합니다.
   *
   * - 빈 값은 키 자체를 지워 주소를 짧게 유지합니다("/shop?category=0"처럼 읽히게).
   * - 기본 정렬(new)도 키를 지웁니다. (기본값을 굳이 주소에 남길 이유가 없습니다)
   * - 조건이 바뀌면 page를 지워 1페이지부터 보여줍니다.
   *   (3페이지를 보다가 조건을 좁히면 결과가 1페이지뿐이라 빈 화면이 나옵니다)
   */
  const applyFilters = (patch: Partial<ProductFilters>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      (Object.keys(patch) as (keyof ProductFilters)[]).forEach((key) => {
        const value = patch[key];
        if (!value || (key === 'sort' && value === 'new')) next.delete(key);
        else next.set(key, value);
      });
      next.delete('page');
      return next;
    });
  };

  /** 검색 실행 — draft(입력값)를 applied(주소창)로 승격시키는 지점 */
  const handleSearch = () => applyFilters({ word: draftWord.trim() });

  /**
   * 가격 범위 적용.
   * 최소가 최대보다 크면 서버에서 0건이 나와 사용자가 원인을 못 찾습니다.
   * 그래서 프론트에서 두 값을 바꿔 끼워 "의도한 범위"로 보정합니다.
   */
  const handlePrice = () => {
    const min = draftPrice.min.replace(/[^0-9]/g, '');
    const max = draftPrice.max.replace(/[^0-9]/g, '');

    if (min && max && Number(min) > Number(max)) {
      applyFilters({ priceMin: max, priceMax: min });
      return;
    }
    applyFilters({ priceMin: min, priceMax: max });
  };

  /** 카테고리 칩 (같은 칩을 다시 누르면 해제) */
  const handleCategory = (value: string) => {
    applyFilters({ category: filters.category === value ? '' : value });
  };

  /** 레벨 태그 칩 (같은 칩을 다시 누르면 해제) */
  const handleLevelTag = (value: string) => {
    applyFilters({ levelTag: filters.levelTag === value ? '' : value });
  };

  /** 필터 전체 초기화 */
  const handleReset = () => {
    setDraftWord('');
    setDraftPrice({ min: '', max: '' });
    setSearchParams(new URLSearchParams());
  };

  /* ==================================================================
     선택된 조건 요약 칩 (X로 개별 해제)

     필터를 접어둔 상태에서도 "지금 무슨 조건이 걸려 있는지" 한눈에 보이게 합니다.
     결과가 0건일 때 사용자가 원인을 바로 찾아 하나씩 풀 수 있습니다.
  ================================================================== */
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: Partial<ProductFilters> }[] = [];

    if (filters.word) {
      chips.push({ key: 'word', label: `검색어: ${filters.word}`, clear: { word: '' } });
    }
    if (filters.category) {
      chips.push({
        key: 'category',
        label: PRODUCT_CATEGORY_LABEL[Number(filters.category)] ?? '카테고리',
        clear: { category: '' },
      });
    }
    if (filters.levelTag) {
      chips.push({
        key: 'levelTag',
        label: `추천 레벨: ${filters.levelTag}`,
        clear: { levelTag: '' },
      });
    }
    if (filters.brand) {
      chips.push({ key: 'brand', label: `브랜드: ${filters.brand}`, clear: { brand: '' } });
    }
    if (filters.priceMin || filters.priceMax) {
      const min = filters.priceMin ? won(Number(filters.priceMin)) : '0원';
      const max = filters.priceMax ? won(Number(filters.priceMax)) : '제한 없음';
      chips.push({
        key: 'price',
        label: `가격: ${min} ~ ${max}`,
        clear: { priceMin: '', priceMax: '' },
      });
    }

    return chips;
  }, [filters]);

  const hasFilter = activeChips.length > 0;

  /* ================================================================== */

  return (
    <div className="container section shop_list">
      <PageHeader
        title="클라이밍 스토어"
        desc="암벽화부터 확보장비까지, 내 레벨에 맞는 장비를 찾아보세요."
        right={
          <Link to="/shop/cart" className="btn btn_dark">
            🛒 장바구니
          </Link>
        }
      />

      {/* ============================ 필터 ============================ */}
      <section className="shop_filter">
        {/* 검색창은 항상 보이게 두고, 상세 필터만 모바일에서 접습니다. */}
        <div className="shop_filter_head">
          <SearchBar
            value={draftWord}
            onChange={setDraftWord}
            onSearch={handleSearch}
            placeholder="상품명 또는 브랜드로 검색 (예: 암벽화, 스카르파)"
          />

          <button
            type="button"
            className={`btn btn_dark shop_filter_toggle ${filterOpen ? 'on' : ''}`}
            onClick={() => setFilterOpen((prev) => !prev)}
            aria-expanded={filterOpen}
          >
            ⚙️ 상세 필터
            {hasFilter && <span className="badge badge_solid">{activeChips.length}</span>}
          </button>
        </div>

        <div className={`shop_filter_body ${filterOpen ? 'open' : ''}`}>
          {/* ---------- 카테고리 ---------- */}
          <div className="shop_filter_row">
            <span className="lb">카테고리</span>
            <div className="chip_group">
              <button
                type="button"
                className={`chip ${!filters.category ? 'on' : ''}`}
                onClick={() => applyFilters({ category: '' })}
              >
                전체
              </button>
              {PRODUCT_CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  className={`chip ${filters.category === String(category.value) ? 'on' : ''}`}
                  onClick={() => handleCategory(String(category.value))}
                >
                  <span aria-hidden="true">{category.icon}</span>
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          {/* ---------- 추천 레벨 ---------- */}
          <div className="shop_filter_row">
            <span className="lb">추천 레벨</span>
            <div className="chip_group">
              <button
                type="button"
                className={`chip ${!filters.levelTag ? 'on' : ''}`}
                onClick={() => applyFilters({ levelTag: '' })}
              >
                전체
              </button>
              {LEVEL_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`chip ${filters.levelTag === tag ? 'on' : ''}`}
                  onClick={() => handleLevelTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* ---------- 가격 범위 ---------- */}
          <div className="shop_filter_row">
            <span className="lb">가격</span>
            <div className="shop_price_range">
              {/*
                숫자만 받도록 type="number"를 쓰되 inputMode="numeric"을 함께 줍니다.
                모바일에서 숫자 키패드가 바로 올라와 입력이 훨씬 편해집니다.
              */}
              <input
                type="number"
                className="form_input"
                inputMode="numeric"
                min={0}
                placeholder="최소"
                value={draftPrice.min}
                onChange={(e) => setDraftPrice((prev) => ({ ...prev, min: e.target.value }))}
                onKeyDown={(e) => onEnter(e, handlePrice)}
                aria-label="최소 가격"
              />
              <span className="shop_price_tilde">~</span>
              <input
                type="number"
                className="form_input"
                inputMode="numeric"
                min={0}
                placeholder="최대"
                value={draftPrice.max}
                onChange={(e) => setDraftPrice((prev) => ({ ...prev, max: e.target.value }))}
                onKeyDown={(e) => onEnter(e, handlePrice)}
                aria-label="최대 가격"
              />
              <button type="button" className="btn btn_outline btn_sm" onClick={handlePrice}>
                적용
              </button>
            </div>
          </div>

          {/* ---------- 정렬 / 초기화 ---------- */}
          <div className="shop_filter_row">
            <span className="lb">정렬</span>
            <div className="flex g8 wrap center flex1">
              <select
                className="form_select shop_sort_select"
                value={filters.sort}
                onChange={(e) => applyFilters({ sort: e.target.value })}
                aria-label="정렬 기준"
              >
                {PRODUCT_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="btn btn_ghost btn_sm"
                onClick={handleReset}
                disabled={!hasFilter && filters.sort === 'new'}
              >
                ↺ 필터 초기화
              </button>
            </div>
          </div>
        </div>

        {/* ---------- 선택된 조건 요약 ---------- */}
        {hasFilter && (
          <div className="shop_selected_chips">
            <span className="t-xs t-faint">적용된 조건</span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="chip on"
                onClick={() => applyFilters(chip.clear)}
                title="이 조건만 해제"
              >
                {chip.label}
                <span className="shop_chip_x">✕</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ============================ 결과 ============================ */}
      <div className="shop_result_head">
        <p className="t-sm t-dim">
          총 <strong className="t-primary">{comma(data.totalElements)}</strong>개 상품
          {hasFilter && <span className="t-faint"> · 조건 검색 결과</span>}
        </p>
        {data.totalPages > 0 && (
          <p className="t-xs t-faint">
            {page} / {data.totalPages} 페이지
          </p>
        )}
      </div>

      {loading ? (
        /* 스켈레톤: 로딩 중 빈 화면이었다가 갑자기 채워지는 레이아웃 흔들림을 막습니다. */
        <SkeletonCards count={CARD_PAGE_SIZE} />
      ) : data.content.length === 0 ? (
        <EmptyState
          icon="🔍"
          message="조건에 맞는 상품이 없습니다."
          sub="가격 범위나 카테고리를 조금 넓혀서 다시 찾아보세요."
          action={
            hasFilter ? (
              <button type="button" className="btn btn_primary" onClick={handleReset}>
                필터 초기화
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid_4">
            {data.content.map((product) => (
              <ProductCard key={product.no} product={product} />
            ))}
          </div>

          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {/* ============================ 모달 ============================ */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
