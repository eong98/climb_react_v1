import { useSearchParams } from 'react-router-dom';

/* ============================================================================
   URL 쿼리스트링 기반 탭 상태 훅

   탭도 페이지 번호와 같은 이유로 URL에 둡니다.
   (뒤로가기 / 새로고침 / 링크 공유 시 선택한 탭이 유지되어야 하므로)

   [주의] 탭을 바꿀 때는 page 쿼리를 지워서 1페이지부터 보게 합니다.
   안 그러면 "자유게시판 5페이지"에서 "질문답변" 탭으로 옮겼을 때
   글이 3페이지뿐인데 5페이지를 요청해 빈 화면이 나옵니다.

   @example
   const { tab, changeTab } = useTab('0');   // 기본 탭 '0'
============================================================================ */

export function useTab(defaultTab = '', paramName = 'tab') {
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get(paramName) ?? defaultTab;

  const changeTab = (nextTab: string) => {
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (nextTab === defaultTab) updated.delete(paramName);
        else updated.set(paramName, nextTab);
        updated.delete('page'); // 탭 변경 시 페이지 초기화
        return updated;
      },
      { replace: true },
    );
  };

  return { tab, changeTab };
}
