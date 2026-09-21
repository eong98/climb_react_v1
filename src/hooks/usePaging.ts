import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/* ============================================================================
   URL 쿼리스트링 기반 페이지 제어 훅

   [왜 페이지 번호를 useState가 아니라 URL에 두나]
   1) 목록 3페이지에서 글을 클릭해 상세로 갔다가 뒤로가기 하면 다시 3페이지로 돌아온다
   2) "이 목록의 3페이지" 링크를 그대로 공유할 수 있다
   3) 새로고침해도 위치가 유지된다
   useState로 관리하면 위 세 가지가 전부 깨집니다.

   @example
   const { page, setPage, goDetail, goList } = usePaging({ basePath: '/community' });
============================================================================ */

interface UsePagingOptions {
  /** 쿼리 파라미터 키 (기본값 'page') */
  paramName?: string;
  /** 기본 페이지 번호 (기본값 1) */
  defaultPage?: number;
  /** 목록 경로 (goList의 기본 이동 대상) */
  basePath?: string;
}

export function usePaging({
  paramName = 'page',
  defaultPage = 1,
  basePath,
}: UsePagingOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  /** 현재 페이지 번호 (1부터). URL에 없으면 기본값 */
  const page = (() => {
    const fromQuery = Number(searchParams.get(paramName));
    return fromQuery > 0 ? fromQuery : defaultPage;
  })();

  /**
   * 페이지 이동.
   * replace: true로 두면 페이지를 넘길 때마다 히스토리가 쌓이지 않아
   * 뒤로가기 한 번에 이전 화면으로 빠져나갈 수 있습니다.
   */
  const setPage = (nextPage: number) => {
    if (nextPage === page) return;
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.set(paramName, String(nextPage));
        return updated;
      },
      { replace: true },
    );
  };

  /** 검색 조건이 바뀌면 1페이지로 되돌립니다 (안 그러면 "3페이지인데 결과가 1페이지뿐" 상황 발생) */
  const resetPage = () => {
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.delete(paramName);
        return updated;
      },
      { replace: true },
    );
  };

  /** 현재 쿼리스트링을 유지한 채 지정 경로로 이동 (목록 → 상세) */
  const goDetail = (to: string) => {
    const query = location.search.replace(/^\?/, '');
    navigate(query ? `${to}${to.includes('?') ? '&' : '?'}${query}` : to);
  };

  /** 현재 쿼리스트링을 유지한 채 목록으로 복귀 (상세 → 목록) */
  const goList = (fallbackPath?: string) => {
    const target = fallbackPath || basePath || location.pathname;
    const query = location.search.replace(/^\?/, '');
    navigate(query ? `${target}${target.includes('?') ? '&' : '?'}${query}` : target);
  };

  return { page, setPage, resetPage, goDetail, goList };
}
