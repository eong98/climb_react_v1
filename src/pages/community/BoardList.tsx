import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { BoardFilters, BoardType } from '../../components/ts/Board';
import {
  BOARD_SORT_OPTIONS,
  BOARD_TYPES,
  BOARD_TYPE_LABEL,
  DEAL_STATUS_LABEL,
  EMPTY_BOARD_FILTERS,
  SEARCH_TYPE_OPTIONS,
} from '../../components/ts/Board';
import type { RegionType } from '../../components/ts/Gym';
import { DAY_LABEL } from '../../components/ts/Gym';
import type { PageResponse } from '../../components/ts/Api';
import { CARD_PAGE_SIZE, EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  ConfirmModal,
  EmptyState,
  Loading,
  PageHeader,
  Pagination,
  SearchBar,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useTab } from '../../hooks/useTab';
import { GlobalStoreSession } from '../../store/LoginStore';
import { axiosInstance, comma, cut, stripTags, toRelativeTime } from '../../utils/Tool';

/* ============================================================================
   커뮤니티 게시판 목록  —  GET /board/list

   [이 화면의 설계 요약]

   1) 게시판 종류(탭)를 URL 쿼리(?tab=)에 둡니다.
      "파트너 구해요 2페이지" 링크를 그대로 공유할 수 있고,
      상세로 들어갔다 뒤로가기 해도 보던 탭·페이지가 그대로 복원됩니다.
      (useTab이 탭 변경 시 page 쿼리를 지워 1페이지로 되돌려 줍니다 —
       "자유게시판 5페이지"에서 "중고거래"로 옮겼는데 글이 2페이지뿐이면 빈 화면이 나옵니다)

   2) 검색 조건은 draft / applied 2단 상태로 관리합니다. (아래 주석 참고)

   3) [핵심] 목록을 탭 종류에 따라 다른 모양으로 그립니다.
      같은 BOARD 테이블이지만 게시판마다 "독자가 먼저 알고 싶은 정보"가 다릅니다.
        - 자유 / 질문답변 : 글이 빠르게 쌓이고 제목만 훑어 내려갑니다  → 테이블형
        - 파트너 구해요   : 언제 · 어디서 만나는지가 제목보다 중요합니다 → 카드형(지역·만남일시 강조)
        - 암장 후기       : 어느 암장 후기인지 + 내용 맛보기가 중요합니다 → 카드형(암장명·본문 미리보기)
        - 중고거래        : 가격과 판매 여부를 한눈에 비교합니다        → 카드 그리드(가격·거래상태 강조)
      "한 화면 한 레이아웃"으로 통일하면 코드는 짧아지지만,
      파트너 모집에서 만남 일시를 보려고 글을 하나씩 열어봐야 하는 UX가 됩니다.
============================================================================ */

/** 중고거래 상태별 배지 색 (common.css의 .badge_* 재사용) */
export const DEAL_STATUS_BADGE: Record<number, string> = {
  0: 'badge_primary', // 판매중
  1: 'badge_warn',    // 예약중
  2: 'badge_muted',   // 거래완료
};

/**
 * 만남 일시 표기. '2026-09-20 19:00:00' → '9/20(일) 19:00'
 *
 * Tool.ts는 모든 페이지가 함께 쓰는 기반 파일이라 커뮤니티 전용 포맷은 여기에 둡니다.
 * (상세 화면에서도 같은 표기를 써야 해서 export 합니다)
 */
export const formatMeetDate = (value?: string): string => {
  if (!value) return '';
  // 'yyyy-MM-dd HH:mm:ss'는 Safari에서 파싱이 실패할 수 있어 'T'로 바꿔 줍니다.
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value.substring(0, 16);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()}(${DAY_LABEL[date.getDay()]}) `
       + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** 만남 일시가 이미 지났는지 (파트너 모집 마감 표시용) */
export const isMeetClosed = (value?: string): boolean => {
  if (!value) return false;
  const date = new Date(value.replace(' ', 'T'));
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
};

export default function BoardList() {
  const location = useLocation();
  const navigate = useNavigate();

  /** 게시판 종류 탭 — 기본값 '0'(자유게시판), URL 쿼리 ?tab= 과 동기화 */
  const { tab, changeTab } = useTab('0');
  const { page, setPage, resetPage } = usePaging({ basePath: '/community' });

  const login = GlobalStoreSession((state) => state.login);

  /** 현재 탭의 게시판 종류 번호 */
  const boardType = Number(tab) || 0;

  /* ------------------------------------------------------------------------
     [면접 포인트] 검색 상태를 draft / applied 두 벌로 나누는 이유

     입력창 값 하나로 바로 조회하면 "파" "파트" "파트너" — 세 글자를 치는 동안
     API가 3번 호출됩니다. 요청이 폭주할 뿐 아니라, 늦게 도착한 옛 응답이
     최신 응답을 덮어써 엉뚱한 결과가 보이는 경쟁 상태(race condition)까지 생깁니다.

     그래서 타이핑은 draft에만 쌓아 두고, 엔터/검색 버튼을 눌렀을 때만 applied로 옮깁니다.
     useEffect 의존성을 applied(와 tab, page)로 두면
     "사용자가 검색을 확정한 순간"에만 정확히 한 번 조회됩니다.

     반대로 select(검색조건·정렬·지역)는 한 번의 클릭으로 끝나는 조작이라
     즉시 applied까지 반영해 바로 결과를 보여줍니다.
     (누른 뒤 검색 버튼을 또 눌러야 하면 답답합니다)
  ------------------------------------------------------------------------ */
  const [draft, setDraft] = useState<BoardFilters>(EMPTY_BOARD_FILTERS);
  const [applied, setApplied] = useState<BoardFilters>(EMPTY_BOARD_FILTERS);

  const [data, setData] = useState<PageResponse<BoardType>>(EMPTY_PAGE<BoardType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** 지역 선택지 (파트너 구해요 탭에서만 필요) */
  const [regions, setRegions] = useState<RegionType[]>([]);

  /** 비로그인 사용자가 글쓰기를 눌렀을 때 띄울 안내 */
  const [needLogin, setNeedLogin] = useState(false);

  /** 테이블형으로 그릴 탭인지 (자유 0 / 질문답변 3) */
  const isTableView = boardType === 0 || boardType === 3;

  /**
   * 한 페이지 크기.
   * 테이블은 한 줄이 얇아 10건도 금방 훑지만, 카드는 세로가 길어
   * 10건이면 스크롤이 어정쩡하게 끊깁니다. 그래서 카드형은 12건으로 둡니다.
   */
  const pageSize = isTableView ? PAGE_SIZE : CARD_PAGE_SIZE;

  /* ==================================================================
     지역 목록 — GET /gym/regions
     '파트너 구해요' 탭에서만 쓰므로 그 탭에 들어왔을 때 한 번만 받아옵니다.
     (쓰지도 않을 데이터를 모든 탭에서 미리 받을 이유가 없습니다)
  ================================================================== */
  useEffect(() => {
    if (boardType !== 1 || regions.length > 0) return;

    const loadRegions = async () => {
      try {
        const res = await axiosInstance.get<RegionType[]>('/gym/regions');
        setRegions(res.data ?? []);
      } catch (err) {
        // 지역 목록이 없어도 나머지 검색은 동작해야 하므로 화면을 막지 않습니다.
        console.error('지역 목록 조회 실패:', err);
      }
    };
    loadRegions();
  }, [boardType, regions.length]);

  /** 시/도 목록 (RegionType은 시/도 행과 시/군/구 행이 섞여 있어 중복을 제거합니다) */
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

  /* ==================================================================
     목록 조회 — GET /board/list
  ================================================================== */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        /*
          빈 값은 파라미터에서 아예 빼서 보냅니다.
          "sido=" 처럼 빈 문자열이 가면 서버가 ""로 검색을 시도할 수 있어
          "조건 없음"과 "빈 문자열 조건"이 헷갈립니다.
        */
        const params: Record<string, string | number> = {
          type: boardType,
          sort: applied.sort,
          page: page - 1, // 화면은 1부터, 스프링 Pageable은 0부터
          size: pageSize,
        };
        if (applied.word) {
          params.word = applied.word;
          params.searchType = applied.searchType;
        }
        // 지역 필터는 파트너 모집에서만 의미가 있습니다.
        if (boardType === 1 && applied.sido) params.sido = applied.sido;

        const res = await axiosInstance.get<PageResponse<BoardType>>('/board/list', { params });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<BoardType>(pageSize));
      } catch (err) {
        if (!alive) return;
        console.error('게시글 목록 조회 실패:', err);
        setError('게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setData(EMPTY_PAGE<BoardType>(pageSize));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    // 컴포넌트가 사라진 뒤 setState가 호출되지 않도록 플래그로 막습니다.
    return () => { alive = false; };
  }, [boardType, applied.word, applied.searchType, applied.sido, applied.sort, page, pageSize]);

  /* ==================================================================
     검색 / 필터 조작
  ================================================================== */

  /** 검색 확정 — draft를 applied로 승격시키는 유일한 지점 */
  const handleSearch = () => {
    setApplied(draft);
    resetPage(); // 3페이지에서 검색했는데 결과가 1페이지뿐이면 빈 화면이 보입니다
  };

  /** select류는 즉시 반영 (draft와 applied를 같은 값으로 동시에 갱신) */
  const applyNow = (patch: Partial<BoardFilters>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setApplied(next);
    resetPage();
  };

  /**
   * 탭 변경.
   * 검색 조건을 통째로 비웁니다 — 자유게시판에서 "파트너"로 검색하던 상태 그대로
   * 중고거래 탭으로 넘어가면 "결과 0건"이 나와 사용자가 원인을 못 찾습니다.
   */
  const handleTab = (nextTab: string) => {
    setDraft(EMPTY_BOARD_FILTERS);
    setApplied(EMPTY_BOARD_FILTERS);
    changeTab(nextTab); // useTab이 page 쿼리를 지워 1페이지로 되돌립니다
  };

  const handleReset = () => {
    setDraft(EMPTY_BOARD_FILTERS);
    setApplied(EMPTY_BOARD_FILTERS);
    resetPage();
  };

  /** 글쓰기 — 비로그인이면 서버를 호출하기 전에 안내합니다(어차피 401이 납니다) */
  const handleWrite = () => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    navigate(`/community/write?type=${boardType}`);
  };

  const isSearching = applied.word !== '' || applied.sido !== '';

  /* ==================================================================
     공지글 최상단 고정

     서버(BoardService)도 NOTICE_YN='Y'를 위로 올려 주지만,
     정렬 옵션을 바꿨을 때도 화면에서 확실히 보장되도록 한 번 더 분리합니다.
     (배열을 직접 정렬하지 않고 두 덩어리로 나눠 이어 붙이면
      같은 그룹 안의 서버 정렬 순서는 그대로 유지됩니다)
  ================================================================== */
  const rows = useMemo(() => {
    const notices = data.content.filter((item) => item.noticeYn === 'Y');
    const normals = data.content.filter((item) => item.noticeYn !== 'Y');
    return [...notices, ...normals];
  }, [data.content]);

  /**
   * 화면에 표시할 글 번호.
   * 서버가 cnt(가상 번호)를 내려주면 그대로 쓰고, 없으면 전체 개수 기준 역순으로 계산합니다.
   * DB의 NO를 그대로 쓰면 삭제된 글 때문에 1, 2, 5, 9처럼 구멍이 생깁니다.
   */
  const displayNo = (board: BoardType, index: number) =>
    board.cnt ?? data.totalElements - (page - 1) * pageSize - index;

  /** 목록에서 상세로 이동할 때 현재 쿼리(tab, page)를 붙여 복귀 지점을 보존합니다 */
  const detailPath = (no: number) => `/community/${no}${location.search}`;

  /* ==================================================================
     탭별 목록 렌더링
  ================================================================== */

  /** 자유 / 질문답변 — 테이블형 */
  const renderTable = () => (
    <div className="table_wrap">
      <table className="table board_table">
        <caption className="hidden">게시글 목록</caption>
        <thead>
          <tr>
            <th scope="col" className="col_no">번호</th>
            <th scope="col">제목</th>
            <th scope="col" className="col_writer">작성자</th>
            <th scope="col" className="col_num">조회</th>
            <th scope="col" className="col_num">추천</th>
            <th scope="col" className="col_date">작성일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((board, index) => {
            const isNotice = board.noticeYn === 'Y';
            return (
              <tr key={board.no} className={isNotice ? 'is_notice' : ''}>
                <td>
                  {isNotice
                    ? <span className="badge badge_solid">공지</span>
                    : displayNo(board, index)}
                </td>

                <td className="col_title">
                  <Link to={detailPath(board.no)}>
                    <span className="txt">{board.title}</span>
                    {!!board.replyCnt && board.replyCnt > 0 && (
                      <span className="board_reply_cnt">[{board.replyCnt}]</span>
                    )}
                    {board.fileyn === 'Y' && (
                      <span className="clip" aria-label="첨부파일 있음">📎</span>
                    )}
                  </Link>
                </td>

                <td className="col_writer t-dim">{board.nickname ?? '탈퇴회원'}</td>
                <td className="col_num t-faint">{comma(board.vcnt)}</td>
                <td className="col_num t-faint">{comma(board.likeCnt)}</td>
                <td className="col_date t-faint">{toRelativeTime(board.cdate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  /** 파트너 구해요 — 지역 + 만남일시를 앞세운 가로 카드 */
  const renderPartner = () => (
    <ul className="board_cards">
      {rows.map((board) => {
        const closed = isMeetClosed(board.meetDate);
        return (
          <li key={board.no} className={`board_card ${closed ? 'is_closed' : ''}`}>
            <Link to={detailPath(board.no)} className="board_card_link">
              <div className="board_card_side">
                <span className="badge badge_info">{board.sido || '지역무관'}</span>
                <span className={`board_meet ${closed ? 'off' : ''}`}>
                  {board.meetDate ? formatMeetDate(board.meetDate) : '일정 협의'}
                </span>
              </div>

              <div className="board_card_main">
                <h4 className="board_card_title ellipsis">
                  {board.noticeYn === 'Y' && <span className="badge badge_solid">공지</span>}
                  {board.title}
                  {board.fileyn === 'Y' && <span className="clip">📎</span>}
                </h4>
                <p className="board_card_meta">
                  <span>{board.nickname ?? '탈퇴회원'}</span>
                  {board.boulderLevel && <span className="level_tag lv3">{board.boulderLevel}</span>}
                  <span>{toRelativeTime(board.cdate)}</span>
                  {!!board.replyCnt && board.replyCnt > 0 && <span>💬 {board.replyCnt}</span>}
                </p>
              </div>

              {/* 만남 일시가 지난 글은 "지금 지원해도 소용없다"는 정보가 제목보다 중요합니다 */}
              <span className={`badge ${closed ? 'badge_muted' : 'badge_primary'} board_card_state`}>
                {closed ? '마감' : '모집중'}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  /** 암장 후기 — 연결된 암장명 + 본문 미리보기 */
  const renderReview = () => (
    <ul className="board_cards">
      {rows.map((board) => (
        <li key={board.no} className="board_card">
          <Link to={detailPath(board.no)} className="board_card_link col">
            <div className="board_card_top">
              {board.noticeYn === 'Y' && <span className="badge badge_solid">공지</span>}
              <span className="badge badge_primary">🧗 {board.gname ?? '암장 미지정'}</span>
              {board.fileyn === 'Y' && <span className="clip">📎</span>}
            </div>

            <h4 className="board_card_title ellipsis">{board.title}</h4>

            {/*
              본문 미리보기.
              content는 서버가 HTML 특수문자를 이스케이프해 저장하지만,
              옛 데이터에 태그가 섞여 있을 수 있어 stripTags로 한 번 더 걷어낸 뒤 자릅니다.
              (목록 API는 CLOB인 content를 내려주지 않을 수 있어 없으면 조용히 생략합니다)
            */}
            {board.content && (
              <p className="board_card_desc">{cut(stripTags(board.content), 90)}</p>
            )}

            <p className="board_card_meta">
              <span>{board.nickname ?? '탈퇴회원'}</span>
              <span>{toRelativeTime(board.cdate)}</span>
              <span>👁 {comma(board.vcnt)}</span>
              {!!board.replyCnt && board.replyCnt > 0 && <span>💬 {board.replyCnt}</span>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );

  /** 중고거래 — 가격 비교가 쉬운 그리드 */
  const renderDeal = () => (
    <div className="board_deal_grid">
      {rows.map((board) => {
        const status = board.dealStatus ?? 0;
        return (
          <Link key={board.no} to={detailPath(board.no)} className="card hover board_deal">
            <div className="board_deal_head">
              <span className={`badge ${DEAL_STATUS_BADGE[status] ?? 'badge_muted'}`}>
                {DEAL_STATUS_LABEL[status] ?? '판매중'}
              </span>
              {board.fileyn === 'Y' && <span className="clip">📎</span>}
            </div>

            <p className="board_deal_price">
              {board.dealPrice ? comma(board.dealPrice) : '가격 문의'}
              {!!board.dealPrice && <span className="won">원</span>}
            </p>

            <h4 className="board_card_title ellipsis line2">{board.title}</h4>

            <p className="board_card_meta">
              <span>{board.nickname ?? '탈퇴회원'}</span>
              <span>{toRelativeTime(board.cdate)}</span>
            </p>
          </Link>
        );
      })}
    </div>
  );

  const renderList = () => {
    if (boardType === 1) return renderPartner();
    if (boardType === 2) return renderReview();
    if (boardType === 4) return renderDeal();
    return renderTable(); // 0(자유) · 3(질문답변)
  };

  /* ================================================================== */

  const currentBoard = BOARD_TYPES.find((item) => item.value === boardType);

  return (
    <div className="container section">
      <PageHeader
        title="커뮤니티"
        desc={currentBoard?.desc ?? '클라이머들이 모여 이야기하는 공간'}
        right={
          <button type="button" className="btn btn_primary" onClick={handleWrite}>
            ✏️ 글쓰기
          </button>
        }
      />

      {/* ============================ 게시판 종류 탭 ============================ */}
      <nav className="tabs board_tabs" aria-label="게시판 종류">
        {BOARD_TYPES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`tab ${boardType === item.value ? 'on' : ''}`}
            onClick={() => handleTab(String(item.value))}
            aria-current={boardType === item.value ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </button>
        ))}
      </nav>

      {/* ============================ 검색 / 필터 ============================ */}
      <div className="filterbar board_filter">
        {/* 검색 조건 (제목/내용/작성자) */}
        <div className="f_item">
          <select
            className="form_select"
            value={draft.searchType}
            aria-label="검색 조건"
            onChange={(e) => setDraft((prev) => ({ ...prev, searchType: e.target.value }))}
          >
            {SEARCH_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {/* 지역 필터 — 파트너 모집에서만 노출 (다른 게시판에는 sido 값 자체가 없습니다) */}
        {boardType === 1 && (
          <div className="f_item">
            <select
              className="form_select"
              value={draft.sido}
              aria-label="지역 선택"
              onChange={(e) => applyNow({ sido: e.target.value })}
            >
              <option value="">지역 전체</option>
              {sidoList.map((sido) => (
                <option key={sido} value={sido}>{sido}</option>
              ))}
            </select>
          </div>
        )}

        <SearchBar
          value={draft.word}
          onChange={(value) => setDraft((prev) => ({ ...prev, word: value }))}
          onSearch={handleSearch}
          placeholder={`${currentBoard?.label ?? '게시판'}에서 검색`}
        />

        <button type="button" className="btn btn_primary" onClick={handleSearch}>
          검색
        </button>

        {/* 정렬 */}
        <div className="f_item">
          <select
            className="form_select"
            value={draft.sort}
            aria-label="정렬 기준"
            onChange={(e) => applyNow({ sort: e.target.value })}
          >
            {BOARD_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {isSearching && (
          <button type="button" className="btn btn_ghost" onClick={handleReset}>
            ↺ 초기화
          </button>
        )}
      </div>

      {/* ============================ 결과 요약 ============================ */}
      <div className="board_result_head">
        <p className="t-sm t-dim">
          {BOARD_TYPE_LABEL[boardType]} 전체{' '}
          <strong className="t-primary">{comma(data.totalElements)}</strong>건
          {isSearching && applied.word && <span className="t-faint"> · ‘{applied.word}’ 검색</span>}
          {isSearching && applied.sido && <span className="t-faint"> · {applied.sido}</span>}
        </p>
        {data.totalPages > 0 && (
          <p className="t-xs t-faint">{page} / {data.totalPages} 페이지</p>
        )}
      </div>

      {/* ============================ 목록 ============================ */}
      {loading ? (
        <Loading message="게시글을 불러오는 중입니다..." />
      ) : error ? (
        <EmptyState icon="⚠️" message={error} sub="네트워크 상태를 확인해 주세요." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={currentBoard?.icon ?? '🧗'}
          message={isSearching ? '검색 결과가 없습니다.' : '아직 등록된 글이 없습니다.'}
          sub={isSearching ? '다른 검색어로 찾아보세요.' : '첫 글의 주인공이 되어 보세요!'}
          action={
            isSearching ? (
              <button type="button" className="btn btn_ghost" onClick={handleReset}>
                검색 초기화
              </button>
            ) : (
              <button type="button" className="btn btn_primary" onClick={handleWrite}>
                글쓰기
              </button>
            )
          }
        />
      ) : (
        <>
          {renderList()}
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {/* ============================ 모달 ============================ */}
      {needLogin && (
        <ConfirmModal
          title="로그인이 필요합니다"
          message={'글쓰기는 로그인 후 이용할 수 있습니다.\n로그인 화면으로 이동할까요?'}
          confirmText="로그인하기"
          onConfirm={() => {
            setNeedLogin(false);
            /*
              로그인 후 "보던 목록"으로 정확히 돌아오도록 현재 주소(쿼리 포함)를
              state.from에 담아 넘깁니다. RequireAuth가 쓰는 규약과 동일합니다.
            */
            navigate('/login', { state: { from: location.pathname + location.search } });
          }}
          onClose={() => setNeedLogin(false)}
        />
      )}
    </div>
  );
}
