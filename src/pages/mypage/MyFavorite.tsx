import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { GymType } from '../../components/ts/Gym';
import type { PageResponse } from '../../components/ts/Api';
import { CARD_PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  EmptyState,
  GymCard,
  PageHeader,
  Pagination,
  SkeletonCards,
} from '../../components/ui';
import MyPageNav from './MyPageNav';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, getErrorMessage } from '../../utils/Tool';

/* ============================================================================
   찜한 암장 — /mypage/favorite

   GET  /favorite/my?page&size  내 찜 목록 (PageResponse<GymDTO>)
   POST /favorite/{gno}         찜 토글 → { favorite, count }

   [설계 메모]
   찜 목록 화면에서 하트를 누르면 "찜 해제"입니다.
   해제한 암장이 목록에 그대로 남아 있으면 "눌렀는데 아무 일도 안 일어났다"로 보이므로
   즉시 목록에서 제거합니다. (이 화면의 목록 = 찜한 것들, 이라는 의미가 유지되어야 합니다)
============================================================================ */

/** 찜 토글 응답 — CONVENTIONS.md 3장: POST /favorite/{gno} → {favorite, count} */
interface FavoriteResult {
  favorite: boolean;
  count: number;
}

export default function MyFavorite() {
  const { page, setPage } = usePaging({ basePath: '/mypage/favorite' });
  const { alert, showAlert, closeAlert } = useAlert();

  const [gyms, setGyms] = useState<GymType[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);

  /* ==================================================================
     목록 조회
  ================================================================== */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<PageResponse<GymType>>('/favorite/my', {
          params: { page: page - 1, size: CARD_PAGE_SIZE }, // 서버는 0부터
        });

        /*
          이 화면의 카드는 전부 "찜한 것"이므로 favorite 플래그를 true로 채워 넣습니다.
          서버가 내려주지 않더라도 하트가 꺼진 채로 보이는 일이 없게 하기 위함입니다.
        */
        setGyms((res.data?.content ?? []).map((gym) => ({ ...gym, favorite: true })));
        setTotalPages(res.data?.totalPages ?? 0);
        setTotalElements(res.data?.totalElements ?? 0);
      } catch (err) {
        console.error('찜 목록 조회 실패:', err);
        setGyms([]);
        showAlert(getErrorMessage(err, '찜 목록을 불러오지 못했습니다.'), 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /* ==================================================================
     찜 해제 — POST /favorite/{gno} (토글)
  ================================================================== */
  const handleToggleFavorite = async (gno: number) => {
    try {
      const res = await axiosInstance.post<FavoriteResult>(`/favorite/${gno}`);

      /*
        서버가 favorite=false를 돌려주면 "해제됨"이므로 목록에서 빼냅니다.
        (혹시 true가 오면 이미 해제됐다가 다시 찜된 상황이므로 그대로 둡니다)

        [실무 팁] 목록 전체를 재조회하지 않는 이유
        재조회하면 스크롤 위치가 초기화되고, 마지막 항목을 지웠을 때
        빈 페이지로 남는 등 화면이 덜컹거립니다. 지금은 한 건만 걷어내고,
        그 결과 페이지가 비면 아래에서 이전 페이지로 보내줍니다.
      */
      if (!res.data.favorite) {
        setGyms((prev) => prev.filter((gym) => gym.no !== gno));
        setTotalElements((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      showAlert(getErrorMessage(err, '찜 해제에 실패했습니다.'), 'error');
    }
  };

  /*
    현재 페이지의 마지막 항목을 해제해서 목록이 비면 이전 페이지로 이동합니다.
    (3페이지에서 마지막 하나를 지우면 "빈 3페이지"에 갇히는 것을 막습니다)
  */
  useEffect(() => {
    if (!loading && gyms.length === 0 && page > 1) {
      setPage(page - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyms.length, loading]);

  return (
    <div className="container section my_page">
      <PageHeader
        title="찜한 암장"
        desc="관심 있는 암장을 모아두고 언제든 다시 찾아보세요."
        right={
          <Link to="/gym" className="btn btn_dark">
            암장 더 찾기
          </Link>
        }
      />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          {!loading && gyms.length > 0 && (
            <p className="t-sm t-dim mb16">
              총 <strong className="t-primary">{comma(totalElements)}</strong>곳을 찜했습니다.
            </p>
          )}

          {loading ? (
            <SkeletonCards count={6} />
          ) : gyms.length === 0 ? (
            <EmptyState
              icon="💚"
              message="아직 찜한 암장이 없습니다."
              sub="암장 카드의 하트를 누르면 여기에 모입니다."
              action={
                <Link to="/gym" className="btn btn_primary">
                  암장 찾아보기
                </Link>
              }
            />
          ) : (
            <>
              <div className="grid grid_3">
                {gyms.map((gym) => (
                  <GymCard key={gym.no} gym={gym} onToggleFavorite={handleToggleFavorite} />
                ))}
              </div>

              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
