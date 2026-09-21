import { useEffect, useMemo, useState } from 'react';

import type { AttachType } from '../../components/ts/Attach';
import { ATTACH_TNAMES, ATTACH_TYPE_LABEL } from '../../components/ts/Attach';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  SearchBar,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import {
  axiosInstance,
  comma,
  cut,
  formatFileSize,
  getAttachUrl,
  getErrorMessage,
  toDate,
} from '../../utils/Tool';

/* ============================================================================
   관리자 - 첨부파일 관리

   조회: GET /attach/list/admin?word=&tname=&type=&page=0&size=10
   삭제: DELETE /attach/{no}  (AttachService가 DB 행과 실제 파일을 함께 제거)

   [면접 포인트] 첨부파일을 따로 관리하는 화면이 왜 필요한가
   파일은 글과 생애주기가 어긋나기 쉽습니다. 글을 지우면서 첨부만 남거나,
   업로드 도중 실패해 "어느 글에도 붙지 않은 파일"이 디스크에 쌓입니다.
   이런 고아 파일은 용량만 먹고 아무도 찾지 못하므로, 테이블/종류로 훑어보고
   지울 수 있는 화면이 있어야 합니다. 총 용량을 함께 보여주는 것도 같은 이유입니다.
============================================================================ */

interface AttachAdminSearch {
  word: string;
  tname: string;
  type: string; // '' | '0'(이미지) | '1'(파일)
}

const EMPTY_SEARCH: AttachAdminSearch = { word: '', tname: '', type: '' };

/** 확장자로 이미지인지 한 번 더 확인 (type=0이지만 썸네일이 없는 경우 대비) */
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

const isImage = (file: AttachType): boolean => {
  if (file.type === 0) return true;
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXT.includes(ext);
};

export default function AdminAttachList() {
  const { page, setPage, resetPage } = usePaging({ basePath: '/admin/attach' });
  const { alert, showAlert, closeAlert } = useAlert();

  const [draft, setDraft] = useState<AttachAdminSearch>(EMPTY_SEARCH);
  const [applied, setApplied] = useState<AttachAdminSearch>(EMPTY_SEARCH);

  const [data, setData] = useState<PageResponse<AttachType>>(EMPTY_PAGE<AttachType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [target, setTarget] = useState<AttachType | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** 이미지 확대 모달 */
  const [zoom, setZoom] = useState<AttachType | null>(null);

  /* ==================================================================
     목록 조회
  ================================================================== */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get<PageResponse<AttachType>>('/attach/list/admin', {
          params: {
            word: applied.word,
            tname: applied.tname,
            // type은 Integer라서 빈 문자열을 보내면 400이 납니다.
            type: applied.type === '' ? undefined : Number(applied.type),
            page: page - 1,
            size: PAGE_SIZE,
          },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<AttachType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('첨부파일 목록 조회 실패:', err);
        setError(getErrorMessage(err, '첨부파일 목록을 불러오지 못했습니다.'));
        setData(EMPTY_PAGE<AttachType>(PAGE_SIZE));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [applied.word, applied.tname, applied.type, page, reloadKey]);

  /**
   * 현재 페이지 파일 용량 합계.
   *
   * [주의] 전체 합계가 아니라 "지금 보이는 페이지"의 합계입니다.
   * 전체 용량은 SUM(FSIZE)을 내려주는 API가 있어야 정확한데 백엔드에 그런 엔드포인트가 없습니다.
   * 프론트에서 전체 페이지를 다 긁어 더하면 파일이 수만 건일 때 브라우저가 멈추므로
   * 계산 범위를 명시해 오해를 없앴습니다. (없는 API를 상상해서 부르지 않습니다)
   */
  const pageSize = useMemo(
    () => data.content.reduce((sum, file) => sum + (file.fsize ?? 0), 0),
    [data.content],
  );

  const handleSearch = () => {
    setApplied(draft);
    resetPage();
  };

  const handleSelect = (key: keyof AttachAdminSearch, value: string) => {
    const next = { ...draft, [key]: value };
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
     삭제 — DELETE /attach/{no}
  ================================================================== */
  const handleDelete = async () => {
    if (!target) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/attach/${target.no}`);
      setTarget(null);
      if (data.content.length === 1 && page > 1) setPage(page - 1);
      else setReloadKey((key) => key + 1);

      showAlert('첨부파일이 삭제되었습니다.', 'success');
    } catch (err) {
      console.error('첨부파일 삭제 실패:', err);
      setTarget(null);
      showAlert(getErrorMessage(err, '삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const isSearching = applied.word !== '' || applied.tname !== '' || applied.type !== '';

  return (
    <>
      <PageHeader
        title="첨부파일 관리"
        desc="업로드된 파일을 테이블·종류별로 확인하고 정리합니다"
      />

      {/* ---------------- 검색 / 필터 ---------------- */}
      <div className="filterbar adm_filter">
        <div className="f_item">
          <select
            className="form_select"
            aria-label="테이블"
            value={draft.tname}
            onChange={(e) => handleSelect('tname', e.target.value)}
          >
            <option value="">전체 테이블</option>
            {ATTACH_TNAMES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="f_item">
          <select
            className="form_select"
            aria-label="파일 종류"
            value={draft.type}
            onChange={(e) => handleSelect('type', e.target.value)}
          >
            <option value="">전체 종류</option>
            {[0, 1].map((type) => (
              <option key={type} value={String(type)}>{ATTACH_TYPE_LABEL[type]}</option>
            ))}
          </select>
        </div>

        <SearchBar
          value={draft.word}
          onChange={(v) => setDraft((prev) => ({ ...prev, word: v }))}
          onSearch={handleSearch}
          placeholder="원본 파일명으로 검색"
        />

        <button type="button" className="btn btn_primary" onClick={handleSearch}>검색</button>
        {isSearching && (
          <button type="button" className="btn btn_ghost" onClick={handleReset}>초기화</button>
        )}
      </div>

      {/* ---------------- 용량 요약 ---------------- */}
      <div className="adm_stat_row">
        <div className="adm_stat">
          <span className="adm_stat_lb">전체 파일</span>
          <b className="adm_stat_val">{comma(data.totalElements)}건</b>
        </div>
        <div className="adm_stat">
          <span className="adm_stat_lb">현재 페이지 용량</span>
          <b className="adm_stat_val t-primary">{formatFileSize(pageSize)}</b>
        </div>
        <p className="adm_note">
          용량 합계는 현재 페이지({data.content.length}건) 기준입니다. 전체 용량이 아닙니다.
        </p>
      </div>

      {loading ? (
        <Loading message="첨부파일을 불러오는 중입니다..." />
      ) : (
        <div className="table_wrap">
          <table className="table adm_table adm_attach_table">
            <caption className="hidden">첨부파일 관리 목록</caption>
            <thead>
              <tr>
                <th scope="col" className="adm_w60">번호</th>
                <th scope="col" className="adm_w80">미리보기</th>
                <th scope="col">원본 파일명</th>
                <th scope="col" className="adm_w120">테이블</th>
                <th scope="col" className="adm_w80">글번호</th>
                <th scope="col" className="adm_w80">종류</th>
                <th scope="col" className="adm_w90">크기</th>
                <th scope="col" className="adm_w110">등록일</th>
                <th scope="col" className="adm_w80">삭제</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr className="empty_row"><td colSpan={9}>{error}</td></tr>
              ) : data.content.length === 0 ? (
                <tr className="empty_row">
                  <td colSpan={9}>
                    {isSearching ? '조건에 맞는 파일이 없습니다.' : '업로드된 파일이 없습니다.'}
                  </td>
                </tr>
              ) : (
                data.content.map((file) => {
                  const image = isImage(file);
                  const tnameLabel =
                    ATTACH_TNAMES.find((item) => item.value === file.tname)?.label ?? file.tname;

                  return (
                    <tr key={file.no}>
                      <td className="mono t-faint">{file.no}</td>

                      <td>
                        {image ? (
                          <img
                            className="adm_thumb adm_thumb_click"
                            src={getAttachUrl(file.purl, file.thumb || file.sname)}
                            alt={file.name}
                            loading="lazy"
                            onClick={() => setZoom(file)}
                          />
                        ) : (
                          <span className="adm_thumb adm_thumb_none">📄</span>
                        )}
                      </td>

                      <td className="col_title">
                        <span className="ellipsis">{cut(file.name, 60)}</span>
                        <span className="adm_sub mono">{file.sname}</span>
                      </td>

                      <td>
                        <span className="badge badge_muted">{tnameLabel}</span>
                      </td>

                      <td className="mono t-faint">{file.bno}</td>

                      <td className="t-faint">{ATTACH_TYPE_LABEL[file.type] ?? '-'}</td>

                      <td className="t-faint adm_nowrap">{formatFileSize(file.fsize)}</td>

                      <td className="t-faint adm_nowrap">{toDate(file.cdate)}</td>

                      <td>
                        <button
                          type="button"
                          className="btn btn_xs btn_danger_outline"
                          onClick={() => setTarget(file)}
                        >
                          삭제
                        </button>
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

      {/* 이미지 확대 */}
      {zoom && (
        <Modal title={zoom.name} large onClose={() => setZoom(null)}>
          <img
            className="adm_zoom_img"
            src={getAttachUrl(zoom.purl, zoom.sname)}
            alt={zoom.name}
          />
          <p className="t-xs t-faint mt8">
            {zoom.tname} / 글번호 {zoom.bno} · {formatFileSize(zoom.fsize)}
          </p>
        </Modal>
      )}

      {target && (
        <ConfirmModal
          title="첨부파일 삭제"
          message={
            `'${cut(target.name, 40)}' 파일을 삭제할까요?\n`
            + 'DB 기록과 서버에 저장된 실제 파일이 함께 삭제되며 되돌릴 수 없습니다.'
          }
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
