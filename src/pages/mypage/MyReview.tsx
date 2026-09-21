import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { GymReviewType } from '../../components/ts/Gym';
import type { PageResponse } from '../../components/ts/Api';
import { PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  EmptyState,
  Loading,
  PageHeader,
  Pagination,
  StarRating,
} from '../../components/ui';
import MyPageNav from './MyPageNav';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, getErrorMessage, toDate } from '../../utils/Tool';

/* ============================================================================
   내가 쓴 리뷰 — /mypage/review

   GET    /review/my?page&size  내 리뷰 목록
   DELETE /review/{no}          리뷰 삭제

   [방어적 응답 처리 — 이 파일의 핵심]
   CONVENTIONS.md에는 `GET /review/my`가 "내가 쓴 리뷰"라고만 적혀 있고,
   페이징인지 단순 배열인지는 명시돼 있지 않습니다.
   (실제 백엔드 GymReviewCont는 PageResponse<GymReviewDTO>를 돌려주지만,
    스펙 문서에 없는 사항이라 구현이 바뀔 여지가 있습니다)

   프론트가 한쪽 형태만 가정하면, 백엔드가 반대로 만들거나 나중에 바꾸는 순간
   `res.data.content.map is not a function` 같은 런타임 에러로 화면이 통째로 죽습니다.
   그래서 아래 normalize()에서 두 형태를 모두 받아 같은 모양으로 변환합니다.

   [실무 팁] "명세에 안 적힌 부분은 방어적으로" — 특히 프론트/백엔드가
   동시에 개발되는 팀 프로젝트에서는 이런 완충 장치가 통합 시점의 사고를 크게 줄여줍니다.
   물론 근본 해법은 명세를 정확히 맞추는 것이고, 이 코드는 그동안의 안전장치입니다.
============================================================================ */

/** 화면이 쓰는 통일된 형태 */
interface NormalizedReviews {
  list: GymReviewType[];
  totalPages: number;
  totalElements: number;
}

/**
 * 서버 응답을 화면이 쓰는 형태로 정규화합니다.
 * - 배열이면: 페이징 없이 전부 받은 것으로 보고 totalPages=1
 * - PageResponse면: content/totalPages/totalElements를 그대로 사용
 * - 그 외(null, 예상 밖 형태)면: 빈 목록
 */
const normalize = (data: unknown): NormalizedReviews => {
  if (Array.isArray(data)) {
    const list = data as GymReviewType[];
    return { list, totalPages: 1, totalElements: list.length };
  }

  if (data && typeof data === 'object' && Array.isArray((data as PageResponse<GymReviewType>).content)) {
    const page = data as PageResponse<GymReviewType>;
    return {
      list: page.content,
      totalPages: page.totalPages ?? 1,
      totalElements: page.totalElements ?? page.content.length,
    };
  }

  return { list: [], totalPages: 0, totalElements: 0 };
};

export default function MyReview() {
  const { page, setPage } = usePaging({ basePath: '/mypage/review' });
  const { alert, showAlert, closeAlert } = useAlert();

  const [data, setData] = useState<NormalizedReviews>({
    list: [],
    totalPages: 0,
    totalElements: 0,
  });
  const [loading, setLoading] = useState(true);

  /* 삭제 대상 리뷰 (null이면 모달 닫힘) */
  const [deleteTarget, setDeleteTarget] = useState<GymReviewType | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ==================================================================
     목록 조회
  ================================================================== */
  const load = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get('/review/my', {
        params: { page: page - 1, size: PAGE_SIZE },
      });
      setData(normalize(res.data));
    } catch (err) {
      console.error('내 리뷰 조회 실패:', err);
      setData({ list: [], totalPages: 0, totalElements: 0 });
      showAlert(getErrorMessage(err, '리뷰 목록을 불러오지 못했습니다.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /* ==================================================================
     삭제 — DELETE /review/{no}
  ================================================================== */
  const handleDelete = async () => {
    if (!deleteTarget?.no) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/review/${deleteTarget.no}`);
      setDeleteTarget(null);

      /*
        삭제 후에는 목록을 다시 불러옵니다.
        찜 해제(MyFavorite)와 달리 여기서는 재조회를 택했습니다.
        리뷰 삭제는 암장의 평점/리뷰수에도 영향을 주는 "무거운" 변경이라
        화면에 남은 숫자(총 N건)까지 정확히 맞추는 쪽이 낫기 때문입니다.
      */
      showAlert('리뷰가 삭제되었습니다.', 'success', () => {
        // 마지막 한 건을 지웠고 1페이지가 아니면 이전 페이지로
        if (data.list.length === 1 && page > 1) setPage(page - 1);
        else load();
      });
    } catch (err) {
      setDeleteTarget(null);
      showAlert(getErrorMessage(err, '리뷰 삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="container section my_page">
      <PageHeader
        title="내가 쓴 리뷰"
        desc="다녀온 암장에 남긴 후기를 모아봤습니다."
        right={
          <Link to="/gym" className="btn btn_dark">
            암장 둘러보기
          </Link>
        }
      />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          {!loading && data.list.length > 0 && (
            <p className="t-sm t-dim mb16">
              총 <strong className="t-primary">{comma(data.totalElements)}</strong>개의 리뷰를
              남겼습니다.
            </p>
          )}

          {loading ? (
            <Loading message="리뷰를 불러오는 중입니다..." />
          ) : data.list.length === 0 ? (
            <EmptyState
              icon="⭐"
              message="아직 작성한 리뷰가 없습니다."
              sub="다녀온 암장에 후기를 남기면 다른 클라이머에게 큰 도움이 됩니다."
              action={
                <Link to="/gym" className="btn btn_primary">
                  암장 찾아보기
                </Link>
              }
            />
          ) : (
            <>
              <ul className="my_review_list">
                {data.list.map((review) => (
                  <li key={review.no} className="card my_review_item">
                    {/* ---------- 상단: 암장명 + 별점 + 삭제 ---------- */}
                    <div className="my_review_head">
                      <div className="flex center g8 wrap flex1">
                        <Link to={`/gym/${review.gno}`} className="my_review_gym">
                          {review.gname ?? '암장'}
                        </Link>
                        <StarRating value={review.rating} size="sm" showNumber />
                      </div>

                      <button
                        type="button"
                        className="btn btn_ghost btn_xs"
                        onClick={() => setDeleteTarget(review)}
                      >
                        삭제
                      </button>
                    </div>

                    {/* ---------- 제목(있을 때) ---------- */}
                    {review.title && <p className="my_review_title">{review.title}</p>}

                    {/* ---------- 본문 ---------- */}
                    <p className="my_review_content">{review.content}</p>

                    {/* ---------- 세부 점수 (있을 때만) ---------- */}
                    {(review.scoreFacility || review.scoreRoute || review.scoreClean) && (
                      <div className="my_review_scores">
                        {!!review.scoreFacility && <span>시설 {review.scoreFacility}점</span>}
                        {!!review.scoreRoute && <span>루트 {review.scoreRoute}점</span>}
                        {!!review.scoreClean && <span>청결 {review.scoreClean}점</span>}
                      </div>
                    )}

                    {/* ---------- 하단: 방문일 / 작성일 / 도움돼요 ---------- */}
                    <div className="my_review_foot">
                      <span className="t-xs t-faint">
                        {review.visitDate ? `방문일 ${toDate(review.visitDate)}` : '방문일 미기재'}
                        {review.cdate && ` · 작성 ${toDate(review.cdate)}`}
                      </span>
                      <span className="badge badge_muted">👍 도움돼요 {review.likeCnt ?? 0}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>

      {/* ==================== 모달 ==================== */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {deleteTarget && (
        <ConfirmModal
          title="리뷰 삭제"
          message={`'${deleteTarget.gname ?? '이 암장'}'에 남긴 리뷰를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`}
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
