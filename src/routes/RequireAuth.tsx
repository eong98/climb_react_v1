import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { GlobalStoreSession, isAdminGrade } from '../store/LoginStore';

/* ============================================================================
   로그인 / 권한 확인 라우트 가드

   [왜 필요한가]
   마이페이지, 글쓰기, 주문 같은 화면은 로그인한 사람만 들어갈 수 있어야 합니다.
   각 페이지마다 "로그인 했나?" 검사를 반복해서 쓰면 빠뜨리기 쉬우므로,
   라우터 단계에서 한 번에 막습니다.

   [면접 포인트] 프론트의 이 가드는 "화면 안내"일 뿐 보안 수단이 아닙니다.
   브라우저 개발자도구로 우회할 수 있기 때문에,
   실제 권한 검사는 반드시 백엔드(Spring Security + JWT)에서 해야 합니다.
   프론트 가드는 "권한 없는 화면을 보여주지 않는 UX"를 위한 것입니다.

   @example
   <Route element={<RequireAuth />}>          // 로그인 필요
   <Route element={<RequireAuth adminOnly />}>// 관리자만
============================================================================ */

interface Props {
  /** true면 관리자(등급 1~5)만 접근 허용 */
  adminOnly?: boolean;
}

export default function RequireAuth({ adminOnly = false }: Props) {
  const { login, grade } = GlobalStoreSession();
  const location = useLocation();

  // 비로그인 → 로그인 페이지로.
  // state에 원래 가려던 주소를 담아두면 로그인 후 그 페이지로 되돌려 보낼 수 있습니다.
  if (!login) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // 관리자 전용 화면에 일반 회원이 접근한 경우
  if (adminOnly && !isAdminGrade(grade)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
