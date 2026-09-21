import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { GlobalStoreSession, isAdminGrade } from '../../store/LoginStore';
import { GlobalStoreCart } from '../../store/CartStore';
import { axiosInstance } from '../../utils/Tool';

/* ============================================================================
   상단 헤더 (모든 페이지 공통)

   - 로그인 상태에 따라 메뉴가 달라집니다 (로그인/회원가입 ↔ 마이페이지/로그아웃)
   - 관리자(등급 1~5)에게만 관리자 메뉴를 보여줍니다
   - 장바구니 개수는 전역 스토어에서 가져옵니다
============================================================================ */

const NAV_ITEMS = [
  { to: '/gym', label: '암장 찾기' },
  { to: '/ai', label: 'AI 추천', badge: 'AI' },
  { to: '/community', label: '커뮤니티' },
  { to: '/shop', label: '스토어' },
  { to: '/notice', label: '공지사항' },
];

export default function Header() {
  const navigate = useNavigate();
  const { login, nickname, grade, clearAuth } = GlobalStoreSession();
  const { count: cartCount, setCount, reset } = GlobalStoreCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  /**
   * 로그인 상태면 장바구니 개수를 가져옵니다.
   * [주의] 의존성 배열에 login을 넣어야 로그인/로그아웃 시 다시 계산됩니다.
   */
  useEffect(() => {
    if (!login) {
      reset();
      return;
    }
    axiosInstance
      .get('/cart')
      .then((res) => {
        // 서버 응답이 배열이면 길이를, 객체면 items 길이를 사용합니다.
        const data = res.data;
        const items = Array.isArray(data) ? data : (data?.items ?? []);
        setCount(items.length);
      })
      .catch(() => reset());
  }, [login]);

  const handleLogout = () => {
    clearAuth();
    reset();
    navigate('/');
  };

  return (
    <header className="header">
      <div className="container wide header_inner">
        {/* 로고 */}
        <Link to="/" className="logo">
          CLIMB<span>:</span>ON
        </Link>

        {/* 메인 내비게이션 */}
        <nav className={`gnb ${mobileOpen ? 'open' : ''}`}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `gnb_item ${isActive ? 'on' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
              {item.badge && <span className="gnb_badge">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>

        {/* 우측 유틸 메뉴 */}
        <div className="header_util">
          <Link to="/shop/cart" className="util_btn" aria-label="장바구니">
            🛒
            {cartCount > 0 && <span className="cart_badge">{cartCount}</span>}
          </Link>

          {login ? (
            <>
              <Link to="/mypage" className="util_user">
                <span className="t-sm t-bold">{nickname}</span>
                <span className="t-xs t-faint">님</span>
              </Link>
              {isAdminGrade(grade) && (
                <Link to="/admin/gym" className="btn btn_sm btn_ghost">관리자</Link>
              )}
              <button type="button" className="btn btn_sm btn_ghost" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn_sm btn_ghost">로그인</Link>
              <Link to="/join" className="btn btn_sm btn_primary">회원가입</Link>
            </>
          )}

          {/* 모바일 햄버거 버튼 */}
          <button
            type="button"
            className="util_btn mobile_only"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="메뉴"
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>
    </header>
  );
}
