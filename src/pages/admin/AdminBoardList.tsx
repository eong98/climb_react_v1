import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { BoardType } from '../../components/ts/Board';
import {
  BOARD_TYPE_LABEL,
  BOARD_TYPES,
  SEARCH_TYPE_OPTIONS,
} from '../../components/ts/Board';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  Loading,
  PageHeader,
  Pagination,
  SearchBar,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useTab } from '../../hooks/useTab';
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, cut, getErrorMessage, toDate } from '../../utils/Tool';

/* ============================================================================
   관리자 - 게시글 통합 관리

   조회: GET /board/list?type=&word=&searchType=&page=0&size=10
   삭제: DELETE /board/{no}   (BoardService가 작성자 본인 또는 관리자만 허용)

   [왜 게시판별 화면을 따로 두지 않나]
   BOARD 테이블 하나에 TYPE으로 5개 게시판이 들어 있습니다.
   신고 대응처럼 "종류와 무관하게 최근 글부터 훑어야 하는" 작업이 관리자 업무의 대부분이라
   전체 통합 목록을 기본으로 두고, 탭으로 종류를 좁히는 구조가 실무에 맞습니다.

   [탭을 URL에 두는 이유]
   글을 지우고 돌아왔을 때 보던 탭이 풀리면 다시 찾아 들어가야 합니다.
   useTab은 탭을 쿼리스트링에 저장하고 탭 변경 시 page를 지워 1페이지부터 보여줍니다.
============================================================================ */

/** 게시판 종류 → 배지 색상 (종류를 한눈에 구분하려고 색을 다르게 줍니다) */
const TYPE_BADGE: Record<number, string> = {
  0: 'badge_muted',
  1: 'badge_primary',
  2: 'badge_info',
  3: 'badge_warn',
  4: 'badge_accent',
};

interface BoardAdminSearch {
  word: string;
  searchType: string; // title | content | writer
}

const EMPTY_SEARCH: BoardAdminSearch = { word: '', searchType: 'title' };

export default function AdminBoardList() {
  const { page, setPage, resetPage } = usePaging({ basePath: '/admin/board' });
  const { tab, changeTab } = useTab(''); // '' = 전체
  const { alert, showAlert, closeAlert } = useAlert();

  const [draft, setDraft] = useState<BoardAdminSearch>(EMPTY_SEARCH);
  const [applied, setApplied] = useState<BoardAdminSearch>(EMPTY_SEARCH);

  const [data, setData] = useState<PageResponse<BoardType>>(EMPTY_PAGE<BoardType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [target, setTarget] = useState<BoardType | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ==================================================================
     목록 조회
  ================================================================== */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get<PageResponse<BoardType>>('/board/list', {
          params: {
            type: tab === '' ? undefined : Number(tab),
            word: applied.word || undefined,
            searchType: applied.word ? applied.searchType : undefined,
            sort: 'new', // 관리 목적이므로 항상 최신순
            page: page - 1,
            size: PAGE_SIZE,
          },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<BoardType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('게시글 목록 조회 실패:', err);
        setError(getErrorMessage(err, '게시글 목록을 불러오지 못했습니다.'));
        setData(EMPTY_PAGE<BoardType>(PAGE_SIZE));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [tab, applied.word, applied.searchType, page, reloadKey]);

  const handleSearch = () => {
    setApplied(draft);
    resetPage();
  };

  const handleReset = () => {
    setDraft(EMPTY_SEARCH);
    setApplied(EMPTY_SEARCH);
    resetPage();
  };

  /* ==================================================================
     삭제 — DELETE /board/{no}
  ================================================================== */
  const handleDelete = async () => {
    if (!target) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/board/${target.no}`);
      setTarget(null);
      if (data.content.length === 1 && page > 1) setPage(page - 1);
      else setReloadKey((key) => key + 1);

      showAlert('게시글이 삭제되었습니다.', 'success');
    } catch (err) {
      console.error('게시글 삭제 실패:', err);
      setTarget(null);
      showAlert(getErrorMessage(err, '삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const isSearching = applied.word !== '';

  return (
    <>
      <PageHeader
        title="게시글 관리"
        desc="커뮤니티 5개 게시판의 글을 한곳에서 확인하고 삭제합니다"
      />

      {/* ---------------- 게시판 종류 탭 ---------------- */}
      <div className="tabs pill adm_tabs">
        <button
          type="button"
          className={`tab ${tab === '' ? 'on' : ''}`}
          onClick={() => changeTab('')}
        >
          전체
        </button>
        {BOARD_TYPES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`tab ${tab === String(item.value) ? 'on' : ''}`}
            onClick={() => changeTab(String(item.value))}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {/* ---------------- 검색 ---------------- */}
      <div className="filterbar adm_filter">
        <div className="f_item">
          <select
            className="form_select"
            aria-label="검색 조건"
            value={draft.searchType}
            onChange={(e) => setDraft((prev) => ({ ...prev, searchType: e.target.value }))}
          >
            {SEARCH_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <SearchBar
          value={draft.word}
          onChange={(v) => setDraft((prev) => ({ ...prev, word: v }))}
          onSearch={handleSearch}
          placeholder="검색어를 입력하세요"
        />

        <button type="button" className="btn btn_primary" onClick={handleSearch}>검색</button>
        {isSearching && (
          <button type="button" className="btn btn_ghost" onClick={handleReset}>초기화</button>
        )}
      </div>

      <div className="adm_summary">
        <p className="t-sm t-faint">
          전체 <b className="t-primary">{comma(data.totalElements)}</b>건
          {tab !== '' && <> · {BOARD_TYPE_LABEL[Number(tab)]}</>}
        </p>
        <p className="adm_note">삭제는 논리 삭제이며 댓글·좋아요도 함께 노출이 중단됩니다.</p>
      </div>

      {loading ? (
        <Loading message="게시글을 불러오는 중입니다..." />
      ) : (
        <div className="table_wrap">
          <table className="table adm_table adm_board_table">
            <caption className="hidden">게시글 관리 목록</caption>
            <thead>
              <tr>
                <th scope="col" className="adm_w60">번호</th>
                <th scope="col" className="adm_w120">게시판</th>
                <th scope="col">제목</th>
                <th scope="col" className="adm_w110">작성자</th>
                <th scope="col" className="adm_w70">조회</th>
                <th scope="col" className="adm_w70">좋아요</th>
                <th scope="col" className="adm_w70">댓글</th>
                <th scope="col" className="adm_w110">등록일</th>
                <th scope="col" className="adm_w140">관리</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr className="empty_row"><td colSpan={9}>{error}</td></tr>
              ) : data.content.length === 0 ? (
                <tr className="empty_row">
                  <td colSpan={9}>
                    {isSearching ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'}
                  </td>
                </tr>
              ) : (
                data.content.map((board) => (
                  <tr key={board.no}>
                    <td className="mono t-faint">{board.no}</td>
                    <td>
                      <span className={`badge ${TYPE_BADGE[board.type] ?? 'badge_muted'}`}>
                        {BOARD_TYPE_LABEL[board.type] ?? '기타'}
                      </span>
                    </td>
                    <td className="col_title">
                      {/* 관리자도 실제 사용자 화면에서 글을 확인하는 편이 맥락 파악에 좋습니다 */}
                      <Link to={`/community/${board.no}`} target="_blank" rel="noreferrer">
                        <span className="txt">{cut(board.title, 60)}</span>
                      </Link>
                      {board.fileyn === 'Y' && <span className="clip">📎</span>}
                    </td>
                    <td className="t-faint">{board.nickname ?? '-'}</td>
                    <td className="t-faint">{comma(board.vcnt)}</td>
                    <td className="t-faint">{comma(board.likeCnt)}</td>
                    <td className="t-faint">{comma(board.replyCnt)}</td>
                    <td className="t-faint adm_nowrap">{toDate(board.cdate)}</td>
                    <td>
                      <div className="adm_actions">
                        <Link
                          className="btn btn_xs btn_dark"
                          to={`/community/${board.no}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          보기
                        </Link>
                        <button
                          type="button"
                          className="btn btn_xs btn_danger_outline"
                          onClick={() => setTarget(board)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />

      {target && (
        <ConfirmModal
          title="게시글 삭제"
          message={`'${cut(target.title, 40)}' 글을 삭제할까요?\n작성자에게는 별도 안내가 가지 않습니다.`}
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setTarget(null)}
        />
      )}

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </>
  );
}
