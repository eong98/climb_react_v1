import { NavLink, useLocation } from 'react-router-dom';

/* ============================================================================
   마이페이지 좌측 서브 내비게이션

   [왜 레이아웃 라우트(<Route element={<MyPageLayout/>}>)를 쓰지 않고 컴포넌트로 만들었나]

   레이아웃 라우트로 묶으면 App.tsx에서 /mypage 하위 경로를 전부 중첩 구조로
   다시 짜야 합니다. 그런데 이 프로젝트의 App.tsx는 이미 완성되어 팀원들이
   공유 중인 파일이라, 라우트 구조를 바꾸면 다른 사람이 작업 중인 브랜치와
   충돌이 납니다. (라우트 트리는 "모두가 건드리는 파일"이라 변경 비용이 큽니다)

   또 하나, 마이페이지 안에서도 성격이 다른 화면이 섞여 있습니다.
   - 목록/대시보드형(내 정보, 찜, 리뷰, 일지) → 내비가 있어야 이동이 편하다
   - 폼형(일지 작성/수정, 주문 상세) → 오히려 내비가 집중을 방해한다
   레이아웃 라우트는 "이 경로 전부"에 일괄 적용되므로 예외를 두기 번거롭지만,
   컴포넌트로 만들면 필요한 페이지에서만 <MyPageNav />를 넣으면 됩니다.

   [실무 팁] 반대로 헤더/푸터처럼 "예외 없이 전부"에 적용되는 껍데기는
   레이아웃 라우트(MainLayout)가 맞습니다. 판단 기준은 "예외가 있는가"입니다.
============================================================================ */

/** 서브 내비 항목 정의. enum 대신 as const 배열을 씁니다(erasableSyntaxOnly). */
const NAV_ITEMS = [
  { to: '/mypage', label: '내 정보', icon: '👤' },
  { to: '/mypage/favorite', label: '찜한 암장', icon: '💚' },
  { to: '/mypage/review', label: '내 리뷰', icon: '⭐' },
  { to: '/mypage/climblog', label: '등반일지', icon: '📘' },
  { to: '/mypage/report', label: 'AI 실력분석', icon: '🤖' },
  { to: '/mypage/order', label: '주문내역', icon: '📦' },
  { to: '/mypage/password', label: '비밀번호 변경', icon: '🔒' },
] as const;

export default function MyPageNav() {
  const { pathname } = useLocation();

  /**
   * 현재 경로가 어떤 메뉴에 속하는지 판단합니다.
   *
   * NavLink의 isActive만으로는 부족한 경우가 있습니다.
   * - /mypage/edit(내 정보 수정)은 "내 정보" 메뉴가 켜져 있어야 자연스럽다
   * - /mypage/climblog/write(일지 작성)은 "등반일지" 메뉴가 켜져 있어야 한다
   * - 반면 /mypage(end 매칭)는 하위 경로까지 켜지면 안 된다
   * 그래서 "메뉴별 활성 규칙"을 직접 정의했습니다.
   */
  const isOn = (to: string) => {
    if (to === '/mypage') {
      // 대시보드와 정보 수정만. (하위의 favorite/climblog 등이 켜지면 안 됨)
      return pathname === '/mypage' || pathname === '/mypage/edit';
    }
    // 나머지는 "해당 경로로 시작하면" 활성 → /mypage/order/12 도 '주문내역'이 켜집니다.
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <aside className="my_nav">
      <p className="my_nav_title">MY PAGE</p>

      <nav className="my_nav_list">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={`my_nav_item ${isOn(item.to) ? 'on' : ''}`}
            /* end를 줘도 위 isOn이 최종 판단을 하므로 className은 직접 계산합니다. */
            end={item.to === '/mypage'}
          >
            <span className="my_nav_icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
