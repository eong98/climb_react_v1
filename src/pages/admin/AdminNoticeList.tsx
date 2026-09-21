import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { NoticeType } from '../../components/ts/Notice';
import {
  NOTICE_TYPE_BADGE,
  NOTICE_TYPE_LABEL,
  NOTICE_TYPES,
} from '../../components/ts/Notice';
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
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, cut, getErrorMessage, toDate } from '../../utils/Tool';

/* ============================================================================
   관리자 - 공지사항 목록

   조회: GET /notice/list?word=&type=&page=0&size=10   (사용자 화면과 같은 API)
   삭제: DELETE /notice/{no}  (관리자만, 논리 삭제)

   사용자 목록(NoticeList.tsx)과 API는 같지만 화면 목적이 다릅니다.
   사용자는 "읽을 글"을 찾고, 관리자는 "고칠 글"을 찾습니다.
   그래서 여기서는 가상 번호 대신 실제 PK를 보여주고 수정/삭제 버튼을 답니다.
============================================================================ */

interface NoticeAdminSearch {
  word: string;
  type: string;
}

const EMPTY_SEARCH: NoticeAdminSearch = { word: '', type: '' };

export default function AdminNoticeList() {
  const navigate = useNavigate();
  const { page, setPage, resetPage } = usePaging({ basePath: '/admin/notice' });
  const { alert, showAlert, closeAlert } = useAlert();

  const [draft, setDraft] = useState<NoticeAdminSearch>(EMPTY_SEARCH);
  const [applied, setApplied] = useState<NoticeAdminSearch>(EMPTY_SEARCH);

  const [data, setData] = useState<PageResponse<NoticeType>>(EMPTY_PAGE<NoticeType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [target, setTarget] = useState<NoticeType | null>(null);
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
        const res = await axiosInstance.get<PageResponse<NoticeType>>('/notice/list', {
          params: {
            word: applied.word,
            type: applied.type === '' ? undefined : Number(applied.type),
            page: page - 1,
            size: PAGE_SIZE,
          },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<NoticeType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('공지 목록 조회 실패:', err);
        setError(getErrorMessage(err, '공지사항을 불러오지 못했습니다.'));
        setData(EMPTY_PAGE<NoticeType>(PAGE_SIZE));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [applied.word, applied.type, page, reloadKey]);

  const handleSearch = () => {
    setApplied(draft);
    resetPage();
  };

  const handleTypeChange = (type: string) => {
    const next = { ...draft, type };
    setDraft(next);
    setApplied(next);
    resetPage();
  };

  const handleReset = () => {
    setDraft(EMPTY_SEARCH);
    setApplied(EMPTY_SEARCH);
    resetPage();
  };

  /* ==================================================================
     삭제 — DELETE /notice/{no}
  ================================================================== */
  const handleDelete = async () => {
    if (!target) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/notice/${target.no}`);
      setTarget(null);
      if (data.content.length === 1 && page > 1) setPage(page - 1);
      else setReloadKey((key) => key + 1);

      showAlert('공지사항이 삭제되었습니다.', 'success');
    } catch (err) {
      console.error('공지 삭제 실패:', err);
      setTarget(null);
      showAlert(getErrorMessage(err, '삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const isSearching = applied.word !== '' || applied.type !== '';

  return (
    <>
      <PageHeader
        title="공지 관리"
        desc="서비스 공지사항을 등록·수정·삭제합니다"
        right={
          <button
            type="button"
            className="btn btn_primary"
            onClick={() => navigate('/admin/notice/write')}
          >
            + 공지 등록
          </button>
        }
      />

      {/* ---------------- 검색 / 필터 ---------------- */}
      <div className="filterbar adm_filter">
        <div className="f_item">
          <select
            className="form_select"
            aria-label="공지 유형"
            value={draft.type}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            <option value="">전체 유형</option>
            {NOTICE_TYPES.map((type) => (
              <option key={type.value} value={String(type.value)}>{type.label}</option>
            ))}
          </select>
        </div>

        <SearchBar
          value={draft.word}
          onChange={(v) => setDraft((prev) => ({ ...prev, word: v }))}
          onSearch={handleSearch}
          placeholder="제목 또는 내용으로 검색"
        />

        <button type="button" className="btn btn_primary" onClick={handleSearch}>검색</button>
        {isSearching && (
          <button type="button" className="btn btn_ghost" onClick={handleReset}>초기화</button>
        )}
      </div>

      <div className="adm_summary">
        <p className="t-sm t-faint">
          전체 <b className="t-primary">{comma(data.totalElements)}</b>건
        </p>
        <p className="adm_note">상단 고정(TOP) 공지는 정렬과 무관하게 목록 맨 위에 노출됩니다.</p>
      </div>

      {loading ? (
        <Loading message="공지사항을 불러오는 중입니다..." />
      ) : (
        <div className="table_wrap">
          <table className="table adm_table adm_notice_table">
            <caption className="hidden">공지사항 관리 목록</caption>
            <thead>
              <tr>
                <th scope="col" className="adm_w60">번호</th>
                <th scope="col" className="adm_w100">유형</th>
                <th scope="col">제목</th>
                <th scope="col" className="adm_w80">고정</th>
                <th scope="col" className="adm_w70">조회</th>
                <th scope="col" className="adm_w110">등록일</th>
                <th scope="col" className="adm_w140">관리</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr className="empty_row"><td colSpan={7}>{error}</td></tr>
              ) : data.content.length === 0 ? (
                <tr className="empty_row">
                  <td colSpan={7}>
                    {isSearching ? '검색 결과가 없습니다.' : '등록된 공지사항이 없습니다.'}
                  </td>
                </tr>
              ) : (
                data.content.map((notice) => {
                  const isTop = notice.topYn === 'Y';
                  return (
                    <tr key={notice.no} className={isTop ? 'is_top' : ''}>
                      <td className="mono t-faint">{notice.no}</td>
                      <td>
                        <span className={`badge ${NOTICE_TYPE_BADGE[notice.type] ?? 'badge_muted'}`}>
                          {notice.typeLabel ?? NOTICE_TYPE_LABEL[notice.type] ?? '일반'}
                        </span>
                      </td>
                      <td className="col_title">
                        <Link to={`/notice/${notice.no}`} target="_blank" rel="noreferrer">
                          <span className="txt">{cut(notice.title, 60)}</span>
                        </Link>
                        {notice.fileyn === 'Y' && <span className="clip">📎</span>}
                      </td>
                      <td>
                        {isTop
                          ? <span className="badge badge_solid">TOP</span>
                          : <span className="t-faint">-</span>}
                      </td>
                      <td className="t-faint">{comma(notice.vcnt)}</td>
                      <td className="t-faint adm_nowrap">{toDate(notice.cdate)}</td>
                      <td>
                        <div className="adm_actions">
                          <button
                            type="button"
                            className="btn btn_xs btn_dark"
                            onClick={() => navigate(`/admin/notice/${notice.no}/edit`)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="btn btn_xs btn_danger_outline"
                            onClick={() => setTarget(notice)}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />

      {target && (
        <ConfirmModal
          title="공지 삭제"
          message={`'${cut(target.title, 40)}' 공지를 삭제할까요?`}
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
