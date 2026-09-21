import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import type { GymFilters, GymType, RegionType } from '../../components/ts/Gym';
import {
  EMPTY_GYM_FILTERS,
  FACILITY_FILTERS,
  GYM_SORT_OPTIONS,
  GYM_TYPE_LABEL,
  GYM_TYPE_OPTIONS,
} from '../../components/ts/Gym';
import type { PageResponse } from '../../components/ts/Api';
import { CARD_PAGE_SIZE, EMPTY_PAGE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  EmptyState,
  GymCard,
  PageHeader,
  Pagination,
  SearchBar,
  SkeletonCards,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession } from '../../store/LoginStore';
import { axiosInstance, comma, getErrorMessage, LEVEL_RANGES } from '../../utils/Tool';

/* ============================================================================
   암장 검색 / 목록  — GET /gym/list

   이 프로젝트의 핵심 화면입니다. 신경 쓴 부분은 크게 세 가지입니다.

   1) [URL 쿼리 = 검색 조건의 단일 진실 공급원]
      필터 상태를 useState에 두지 않고 useSearchParams(주소창)에 둡니다.
      - 메인 페이지에서 "/gym?type=0", "/gym?levelMin=40&levelMax=59" 같은
        딥링크로 들어오는 동선이 실제로 존재합니다. 상태를 useState에 두면
        이런 진입 파라미터를 따로 파싱해 초기화하는 코드를 또 써야 하고,
        그 둘이 어긋나면 "주소는 볼더링인데 화면은 전체" 같은 버그가 납니다.
      - 뒤로가기 / 새로고침 / 링크 공유에서도 조건이 그대로 살아납니다.
      URL 하나만 보면 화면 상태를 100% 복원할 수 있다는 점이 가장 큰 장점입니다.

   2) [draft / applied 2단 패턴]
      - 텍스트 입력(검색어)은 draft(로컬 state)에만 두고 엔터·버튼에서만 URL에 반영합니다.
        한 글자 칠 때마다 서버를 때리면 "강남"을 치는 동안 요청이 2번 날아갑니다.
      - 반대로 칩·체크박스·셀렉트는 "한 번 누르면 곧 결과를 보고 싶은" 조작이므로
        즉시 URL에 반영해 바로 재조회합니다. (누르고 또 검색 버튼을 눌러야 하면 답답합니다)
      즉 "입력 비용이 큰 것은 지연 반영, 한 번의 클릭으로 끝나는 것은 즉시 반영"이 기준입니다.

   3) [난이도 범위 필터] — 이 서비스의 차별점
      "이 난이도 문제가 실제로 있는 암장만" 골라 줍니다.
      체계가 제각각인 난이도(V4 / 5.11a / 6b+ / 빨강)를 0~100 점수(SORT_ORDER)로
      정규화해 두었기 때문에 가능한 검색입니다.
============================================================================ */

/** 찜 토글 응답 — CONVENTIONS.md 3장: POST /favorite/{gno} → {favorite, count} */
interface FavoriteResult {
  favorite: boolean;
  count: number;
}

export default function GymList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, setPage } = usePaging({ basePath: '/gym' });
  const { alert, showAlert, closeAlert } = useAlert();
  const navigate = useNavigate();
  const location = useLocation();

  const login = GlobalStoreSession((state) => state.login);

  /* ------------------------------------------------------------------
     적용된(applied) 검색 조건 — 주소창에서 읽어옵니다.

     useMemo를 쓰는 이유: searchParams가 바뀔 때만 객체를 새로 만들어
     아래 useEffect의 의존성이 불필요하게 요동치지 않게 하기 위해서입니다.
  ------------------------------------------------------------------ */
  const filters: GymFilters = useMemo(
    () => ({
      ...EMPTY_GYM_FILTERS,
      word: searchParams.get('word') ?? '',
      type: searchParams.get('type') ?? '',
      sido: searchParams.get('sido') ?? '',
      sigungu: searchParams.get('sigungu') ?? '',
      levelMin: searchParams.get('levelMin') ?? '',
      levelMax: searchParams.get('levelMax') ?? '',
      parking: searchParams.get('parking') ?? '',
      shower: searchParams.get('shower') ?? '',
      locker: searchParams.get('locker') ?? '',
      shoeRent: searchParams.get('shoeRent') ?? '',
      lesson: searchParams.get('lesson') ?? '',
      openNow: searchParams.get('openNow') ?? '',
      sort: searchParams.get('sort') ?? 'rating',
    }),
    [searchParams],
  );

  /* 검색어 입력값(draft). 적용값과 분리해서 관리합니다. */
  const [draftWord, setDraftWord] = useState(filters.word);

  /**
   * 주소창의 word가 바뀌면 입력창도 맞춰 줍니다.
   * (뒤로가기로 이전 검색어로 돌아왔는데 입력창만 최신 글자를 들고 있으면 어색하므로)
   */
  useEffect(() => {
    setDraftWord(filters.word);
  }, [filters.word]);

  /* 목록 데이터 */
  const [data, setData] = useState<PageResponse<GymType>>(EMPTY_PAGE<GymType>(CARD_PAGE_SIZE));
  const [loading, setLoading] = useState(true);

  /* 지역 선택지 */
  const [regions, setRegions] = useState<RegionType[]>([]);

  /* 모바일에서 필터 접기/펼치기 (데스크톱은 CSS로 항상 펼침) */
  const [filterOpen, setFilterOpen] = useState(false);

  /* 비로그인 사용자가 찜을 눌렀을 때 띄울 안내 모달 */
  const [needLogin, setNeedLogin] = useState(false);

  /* ==================================================================
     지역 목록 — GET /gym/regions
     선택지 데이터라 자주 바뀌지 않으므로 화면 진입 시 한 번만 받아옵니다.
  ================================================================== */
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const res = await axiosInstance.get<RegionType[]>('/gym/regions');
        setRegions(res.data ?? []);
      } catch (err) {
        // 지역 목록이 없어도 나머지 검색은 동작해야 하므로 화면을 막지 않고 조용히 넘어갑니다.
        console.error('지역 목록 조회 실패:', err);
      }
    };
    loadRegions();
  }, []);

  /**
   * 시/도 목록 (중복 제거).
   *
   * useMemo를 쓰는 이유: regions는 200건이 넘을 수 있는데,
   * 이 파생 계산을 렌더마다 반복하면 필터를 한 번 누를 때마다 같은 순회를 또 돕니다.
   * regions가 바뀔 때만 계산하도록 고정합니다.
   */
  const sidoList = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    regions.forEach((region) => {
      if (region.sido && !seen.has(region.sido)) {
        seen.add(region.sido);
        list.push(region.sido);
      }
    });
    return list;
  }, [regions]);

  /**
   * 선택된 시/도에 속한 시/군/구 목록.
   *
   * 백엔드 RegionDTO는 @JsonInclude(NON_NULL)이라 "시/도 전체" 행은 sigungu 필드가
   * 아예 내려오지 않습니다. 그래서 sigungu가 있는 행만 골라냅니다.
   * 시/도가 바뀔 때만 다시 계산하면 되므로 useMemo로 묶었습니다.
   */
  const sigunguList = useMemo(() => {
    if (!filters.sido) return [];
    return regions
      .filter((region) => region.sido === filters.sido && !!region.sigungu)
      .map((region) => region.sigungu as string);
  }, [regions, filters.sido]);

  /* ==================================================================
     목록 조회 — GET /gym/list
  ================================================================== */

  /** 주소창 쿼리 문자열. 이 값이 바뀔 때만 다시 조회하면 중복 호출이 없습니다. */
  const queryKey = searchParams.toString();

  useEffect(() => {
    const loadList = async () => {
      setLoading(true);
      try {
        /*
          빈 값은 파라미터에서 아예 빼서 보냅니다.
          "sido=" 처럼 빈 문자열이 가면 서버가 ""로 검색을 시도할 수 있어
          "조건 없음"과 "빈 문자열 조건"이 헷갈립니다.
        */
        const params: Record<string, string | number> = {
          page: page - 1, // 서버는 0부터, 화면은 1부터
          size: CARD_PAGE_SIZE,
          sort: filters.sort,
        };
        if (filters.word) params.word = filters.word;
        if (filters.type) params.type = filters.type;
        if (filters.sido) params.sido = filters.sido;
        if (filters.sigungu) params.sigungu = filters.sigungu;
        if (filters.levelMin) params.levelMin = filters.levelMin;
        if (filters.levelMax) params.levelMax = filters.levelMax;
        if (filters.parking) params.parking = filters.parking;
        if (filters.shower) params.shower = filters.shower;
        if (filters.locker) params.locker = filters.locker;
        if (filters.shoeRent) params.shoeRent = filters.shoeRent;
        if (filters.lesson) params.lesson = filters.lesson;
        if (filters.openNow) params.openNow = filters.openNow;

        const res = await axiosInstance.get<PageResponse<GymType>>('/gym/list', { params });
        setData(res.data ?? EMPTY_PAGE<GymType>(CARD_PAGE_SIZE));
      } catch (err) {
        console.error('암장 목록 조회 실패:', err);
        setData(EMPTY_PAGE<GymType>(CARD_PAGE_SIZE));
        showAlert(getErrorMessage(err, '암장 목록을 불러오지 못했습니다.'), 'error');
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
   * 빈 값은 키 자체를 지워서 주소를 짧게 유지합니다("/gym?type=0"처럼 읽히게).
   * 그리고 조건이 바뀌면 page를 지워 1페이지부터 보여줍니다.
   * (3페이지를 보다가 조건을 좁히면 결과가 1페이지뿐이라 빈 화면이 나옵니다)
   */
  const applyFilters = (patch: Partial<GymFilters>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      (Object.keys(patch) as (keyof GymFilters)[]).forEach((key) => {
        const value = patch[key];
        if (!value || (key === 'sort' && value === 'rating')) next.delete(key);
        else next.set(key, value);
      });
      next.delete('page');
      return next;
    });
  };

  /** 검색 실행 — draft(입력값)를 applied(주소창)로 승격시키는 지점 */
  const handleSearch = () => applyFilters({ word: draftWord.trim() });

  /** 암장 유형 칩 (같은 칩을 다시 누르면 해제) */
  const handleType = (value: string) => {
    applyFilters({ type: filters.type === value ? '' : value });
  };

  /** 시/도 변경 — 시/군/구는 같이 초기화해야 "서울 + 수원시" 같은 조합이 안 생깁니다. */
  const handleSido = (value: string) => {
    applyFilters({ sido: value, sigungu: '' });
  };

  /** 난이도 구간 칩 → levelMin / levelMax 두 파라미터로 변환 */
  const handleLevel = (min: number, max: number) => {
    const isOn = filters.levelMin === String(min) && filters.levelMax === String(max);
    applyFilters(
      isOn ? { levelMin: '', levelMax: '' } : { levelMin: String(min), levelMax: String(max) },
    );
  };

  /** 시설 체크박스 — 체크되면 'Y', 해제되면 빈 값 */
  const handleFacility = (key: keyof GymFilters, checked: boolean) => {
    applyFilters({ [key]: checked ? 'Y' : '' } as Partial<GymFilters>);
  };

  /** 필터 전체 초기화 */
  const handleReset = () => {
    setDraftWord('');
    setSearchParams(new URLSearchParams());
  };

  /* ==================================================================
     선택된 필터 요약 칩 (X로 개별 해제)

     필터를 접어둔 상태에서도 "지금 무슨 조건이 걸려 있는지" 한눈에 보이게 합니다.
     결과가 0건일 때 사용자가 원인을 바로 찾아 하나씩 풀 수 있습니다.
  ================================================================== */
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: Partial<GymFilters> }[] = [];

    if (filters.word) {
      chips.push({ key: 'word', label: `검색어: ${filters.word}`, clear: { word: '' } });
    }
    if (filters.type) {
      chips.push({
        key: 'type',
        label: GYM_TYPE_LABEL[Number(filters.type)] ?? '유형',
        clear: { type: '' },
      });
    }
    if (filters.sido) {
      chips.push({
        key: 'sido',
        label: `${filters.sido}${filters.sigungu ? ` ${filters.sigungu}` : ''}`,
        clear: { sido: '', sigungu: '' },
      });
    }
    if (filters.levelMin && filters.levelMax) {
      const range = LEVEL_RANGES.find(
        (item) => String(item.min) === filters.levelMin && String(item.max) === filters.levelMax,
      );
      chips.push({
        key: 'level',
        label: `난이도: ${range ? range.label : `${filters.levelMin}~${filters.levelMax}`}`,
        clear: { levelMin: '', levelMax: '' },
      });
    }
    FACILITY_FILTERS.forEach((facility) => {
      if (filters[facility.key] === 'Y') {
        chips.push({
          key: facility.key,
          label: facility.label,
          clear: { [facility.key]: '' } as Partial<GymFilters>,
        });
      }
    });
    if (filters.openNow === 'Y') {
      chips.push({ key: 'openNow', label: '지금 영업중', clear: { openNow: '' } });
    }

    return chips;
  }, [filters]);

  /* ==================================================================
     찜 토글 — POST /favorite/{gno}
  ================================================================== */
  const handleToggleFavorite = async (gno: number) => {
    // 비로그인이면 서버를 호출하기 전에 막습니다(어차피 401이 납니다).
    if (!login) {
      setNeedLogin(true);
      return;
    }

    try {
      const res = await axiosInstance.post<FavoriteResult>(`/favorite/${gno}`);

      /*
        [실무 팁] 목록 전체를 다시 조회하지 않고 해당 카드만 바꿉니다.
        재조회하면 정렬이 바뀌어 카드가 튀거나, 스크롤 위치가 초기화돼
        "하트를 눌렀을 뿐인데 화면이 흔들리는" 경험이 됩니다.
      */
      setData((prev) => ({
        ...prev,
        content: prev.content.map((gym) =>
          gym.no === gno
            ? { ...gym, favorite: res.data.favorite, favoriteCnt: res.data.count }
            : gym,
        ),
      }));
    } catch (err) {
      showAlert(getErrorMessage(err, '찜 처리에 실패했습니다.'), 'error');
    }
  };

  /* ================================================================== */

  const hasFilter = activeChips.length > 0;

  return (
    <div className="container section">
      <PageHeader
        title="암장 찾기"
        desc="지역 · 난이도 · 시설 조건으로 나에게 맞는 클라이밍장을 찾아보세요."
        right={
          <>
            <Link to="/ai" className="btn btn_outline">
              🤖 AI 검색
            </Link>
            <Link to="/gym/map" className="btn btn_dark">
              🗺️ 지도로 보기
            </Link>
          </>
        }
      />

      {/* ============================ 필터 ============================ */}
      <section className="gym_filter">
        {/* 검색창은 항상 보이게 두고, 상세 필터만 모바일에서 접습니다. */}
        <div className="gym_filter_head">
          <SearchBar
            value={draftWord}
            onChange={setDraftWord}
            onSearch={handleSearch}
            placeholder="암장명 또는 주소로 검색 (예: 더클라임, 강남)"
          />

          <button
            type="button"
            className={`btn btn_dark filter_toggle ${filterOpen ? 'on' : ''}`}
            onClick={() => setFilterOpen((prev) => !prev)}
            aria-expanded={filterOpen}
          >
            ⚙️ 상세 필터 {hasFilter && <span className="badge badge_solid">{activeChips.length}</span>}
          </button>
        </div>

        <div className={`gym_filter_body ${filterOpen ? 'open' : ''}`}>
          {/* ---------- 암장 유형 ---------- */}
          <div className="filter_row">
            <span className="lb">암장 유형</span>
            <div className="chip_group">
              <button
                type="button"
                className={`chip ${!filters.type ? 'on' : ''}`}
                onClick={() => applyFilters({ type: '' })}
              >
                전체
              </button>
              {GYM_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chip ${filters.type === String(option.value) ? 'on' : ''}`}
                  onClick={() => handleType(String(option.value))}
                  title={option.desc}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* ---------- 지역 ---------- */}
          <div className="filter_row">
            <span className="lb">지역</span>
            <div className="flex g8 wrap">
              <select
                className="form_select region_select"
                value={filters.sido}
                onChange={(e) => handleSido(e.target.value)}
                aria-label="시/도 선택"
              >
                <option value="">시/도 전체</option>
                {sidoList.map((sido) => (
                  <option key={sido} value={sido}>
                    {sido}
                  </option>
                ))}
              </select>

              {/* 시/도를 고르기 전에는 비활성화 — 어떤 시/군/구가 나올지 알 수 없기 때문 */}
              <select
                className="form_select region_select"
                value={filters.sigungu}
                onChange={(e) => applyFilters({ sigungu: e.target.value })}
                disabled={!filters.sido || sigunguList.length === 0}
                aria-label="시/군/구 선택"
              >
                <option value="">{filters.sido ? '시/군/구 전체' : '시/도를 먼저 선택'}</option>
                {sigunguList.map((sigungu) => (
                  <option key={sigungu} value={sigungu}>
                    {sigungu}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ---------- 난이도 범위 (차별점) ---------- */}
          <div className="filter_row">
            <span className="lb">
              난이도
              <em className="level_filter_desc">
                해당 난이도 문제가
                <br />
                실제로 있는 암장만
              </em>
            </span>
            <div className="flex col g8 flex1">
              <div className="chip_group">
                <button
                  type="button"
                  className={`chip ${!filters.levelMin ? 'on' : ''}`}
                  onClick={() => applyFilters({ levelMin: '', levelMax: '' })}
                >
                  전체
                </button>
                {LEVEL_RANGES.map((range) => {
                  const on =
                    filters.levelMin === String(range.min) && filters.levelMax === String(range.max);
                  return (
                    <button
                      key={range.label}
                      type="button"
                      className={`chip lv_chip ${range.cls} ${on ? 'on' : ''}`}
                      onClick={() => handleLevel(range.min, range.max)}
                    >
                      {range.label}
                      <span className="lv_score">
                        {range.min}~{range.max}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="t-xs t-faint">
                V등급 · 5.10a · 6b+ · 색상처럼 체계가 다른 난이도를 0~100점으로 정규화해
                범위로 검색합니다. “중급 문제가 있는 암장”을 체계와 무관하게 찾을 수 있습니다.
              </p>
            </div>
          </div>

          {/* ---------- 시설 ---------- */}
          <div className="filter_row">
            <span className="lb">시설</span>
            <div className="flex g16 wrap">
              {FACILITY_FILTERS.map((facility) => (
                <label key={facility.key} className="check">
                  <input
                    type="checkbox"
                    checked={filters[facility.key] === 'Y'}
                    onChange={(e) => handleFacility(facility.key, e.target.checked)}
                  />
                  <span>
                    {facility.icon} {facility.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* ---------- 영업중 / 정렬 / 초기화 ---------- */}
          <div className="filter_row">
            <span className="lb">기타</span>
            <div className="flex g8 wrap center flex1">
              <button
                type="button"
                className={`chip ${filters.openNow === 'Y' ? 'on' : ''}`}
                onClick={() => applyFilters({ openNow: filters.openNow === 'Y' ? '' : 'Y' })}
              >
                🟢 지금 영업중
              </button>

              <select
                className="form_select sort_select"
                value={filters.sort}
                onChange={(e) => applyFilters({ sort: e.target.value })}
                aria-label="정렬 기준"
              >
                {GYM_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="btn btn_ghost btn_sm"
                onClick={handleReset}
                disabled={!hasFilter && filters.sort === 'rating'}
              >
                ↺ 필터 초기화
              </button>
            </div>
          </div>
        </div>

        {/* ---------- 선택된 조건 요약 ---------- */}
        {hasFilter && (
          <div className="selected_chips">
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
                <span className="chip_x">✕</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ============================ 결과 ============================ */}
      <div className="result_head">
        <p className="t-sm t-dim">
          총 <strong className="t-primary">{comma(data.totalElements)}</strong>곳
          {hasFilter && <span className="t-faint"> · 조건 검색 결과</span>}
        </p>
        {data.totalPages > 0 && (
          <p className="t-xs t-faint">
            {page} / {data.totalPages} 페이지
          </p>
        )}
      </div>

      {loading ? (
        <SkeletonCards count={8} />
      ) : data.content.length === 0 ? (
        <EmptyState
          icon="🔍"
          message="조건에 맞는 암장이 없습니다."
          sub="조건을 조금 넓혀서 다시 찾아보세요."
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
            {data.content.map((gym) => (
              <GymCard key={gym.no} gym={gym} onToggleFavorite={handleToggleFavorite} />
            ))}
          </div>

          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {/* ============================ 모달 ============================ */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {needLogin && (
        <ConfirmModal
          title="로그인이 필요합니다"
          message={'찜하기는 로그인 후 이용할 수 있습니다.\n로그인 화면으로 이동할까요?'}
          confirmText="로그인하기"
          onConfirm={() => {
            setNeedLogin(false);
            /*
              로그인 후 "보던 검색 결과"로 정확히 돌아오도록 현재 주소(쿼리 포함)를
              state.from에 담아 넘깁니다. RequireAuth가 쓰는 방식과 같은 규약이라
              로그인 화면은 state.from 하나만 보면 됩니다.
            */
            navigate('/login', { state: { from: location.pathname + location.search } });
          }}
          onClose={() => setNeedLogin(false)}
        />
      )}
    </div>
  );
}
