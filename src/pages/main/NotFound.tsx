import { Link, useLocation, useNavigate } from 'react-router-dom';

/* ============================================================================
   404 페이지

   App.tsx의 <Route path="*"> 에 연결되어 있습니다.
   MainLayout 안에 있으므로 헤더/푸터는 그대로 유지되고,
   사용자는 길을 잃은 상태에서도 바로 다른 메뉴로 빠져나갈 수 있습니다.

   [실무 팁] 404 화면에서 가장 중요한 건 사과 문구가 아니라 "탈출구"입니다.
   홈으로 가기 · 뒤로 가기 · 주요 메뉴 링크를 함께 두어
   사용자가 뒤로가기 버튼을 찾아 헤매지 않게 합니다.
============================================================================ */

/** 404에서 안내할 주요 메뉴 */
const SHORTCUTS = [
  { to: '/gym', label: '암장 찾기' },
  { to: '/ai', label: 'AI 추천' },
  { to: '/community', label: '커뮤니티' },
  { to: '/shop', label: '스토어' },
  { to: '/notice', label: '공지사항' },
] as const;

export default function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="container">
      <div className="nf_wrap">
        <p className="nf_code">404</p>

        <h2>홀드를 놓쳤습니다 🧗‍♀️</h2>

        <p>
          찾으시는 페이지가 없습니다. 주소가 바뀌었거나 삭제된 것 같아요.
          <br />
          떨어졌어도 괜찮습니다. 매트 위에서 다시 시작하면 되니까요.
        </p>

        {/* 어떤 주소에서 튕겼는지 보여주면 사용자가 오타를 스스로 찾을 수 있습니다 */}
        <p className="t-xs t-faint mono mt12">{location.pathname}</p>

        <div className="actions center">
          {/* navigate(-1): 브라우저 뒤로가기와 같은 동작 */}
          <button type="button" className="btn btn_ghost btn_lg" onClick={() => navigate(-1)}>
            이전 페이지
          </button>
          <Link to="/" className="btn btn_primary btn_lg">홈으로 가기</Link>
        </div>

        <div className="chip_group mt32 flex mid">
          {SHORTCUTS.map((item) => (
            <Link key={item.to} to={item.to} className="chip">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
