import { NavLink, Outlet } from 'react-router-dom';
import Header from './Header';

/* ============================================================================
   관리자 화면 레이아웃 (좌측 사이드바 + 본문)

   사용자 화면과 달리 푸터/챗봇 없이 작업 공간을 넓게 씁니다.
============================================================================ */

const ADMIN_MENUS = [
  { to: '/admin/gym', label: '암장 관리', icon: '🧗' },
  { to: '/admin/member', label: '회원 관리', icon: '👥' },
  { to: '/admin/board', label: '게시글 관리', icon: '💬' },
  { to: '/admin/product', label: '상품 관리', icon: '🛍️' },
  { to: '/admin/order', label: '주문 관리', icon: '📦' },
  { to: '/admin/notice', label: '공지 관리', icon: '📢' },
  { to: '/admin/attach', label: '첨부파일 관리', icon: '📎' },
];

export default function AdminLayout() {
  return (
    <>
      <Header />
      <div className="admin_wrap">
        <aside className="admin_side">
          <p className="admin_side_title">관리자 메뉴</p>
          <nav>
            {ADMIN_MENUS.map((menu) => (
              <NavLink
                key={menu.to}
                to={menu.to}
                className={({ isActive }) => `admin_menu ${isActive ? 'on' : ''}`}
              >
                <span>{menu.icon}</span>
                {menu.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <section className="admin_body">
          <Outlet />
        </section>
      </div>
    </>
  );
}
