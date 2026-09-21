/* --------------------------- 전역 스타일 --------------------------- */
import '../styles/common.css';     /* 공통 컴포넌트 (버튼/폼/카드/모달 등) */
import '../styles/layout.css';     /* 헤더/푸터/관리자 레이아웃 */
import '../styles/main.css';       /* 메인·로그인·공지 */
import '../styles/gym.css';        /* 암장 검색/상세/지도/AI */
import '../styles/community.css';  /* 커뮤니티 */
import '../styles/shop.css';       /* 스토어 */
import '../styles/mypage.css';     /* 마이페이지 */
import '../styles/admin.css';      /* 관리자 */
/* ------------------------------------------------------------------ */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ScrollToTop } from '../utils/Tool';

import MainLayout from '../components/layout/MainLayout';
import AdminLayout from '../components/layout/AdminLayout';
import RequireAuth from './RequireAuth';

/* 메인 */
import Home from '../pages/main/Home';
import Login from '../pages/main/Login';
import Join from '../pages/main/Join';
import NoticeList from '../pages/main/NoticeList';
import NoticeDetail from '../pages/main/NoticeDetail';
import NotFound from '../pages/main/NotFound';

/* 암장 */
import GymList from '../pages/gym/GymList';
import GymDetail from '../pages/gym/GymDetail';
import GymMap from '../pages/gym/GymMap';
import AiSearch from '../pages/gym/AiSearch';

/* 커뮤니티 */
import BoardList from '../pages/community/BoardList';
import BoardDetail from '../pages/community/BoardDetail';
import BoardForm from '../pages/community/BoardForm';

/* 스토어 */
import ProductList from '../pages/shop/ProductList';
import ProductDetail from '../pages/shop/ProductDetail';
import Cart from '../pages/shop/Cart';
import OrderForm from '../pages/shop/OrderForm';
import OrderComplete from '../pages/shop/OrderComplete';
import OrderTossSuccess from '../pages/shop/OrderTossSuccess';
import OrderTossFail from '../pages/shop/OrderTossFail';

/* 마이페이지 */
import MyPage from '../pages/mypage/MyPage';
import ProfileEdit from '../pages/mypage/ProfileEdit';
import PasswordChange from '../pages/mypage/PasswordChange';
import MyFavorite from '../pages/mypage/MyFavorite';
import MyReview from '../pages/mypage/MyReview';
import ClimbLogList from '../pages/mypage/ClimbLogList';
import ClimbLogForm from '../pages/mypage/ClimbLogForm';
import LevelReport from '../pages/mypage/LevelReport';
import MyOrder from '../pages/mypage/MyOrder';
import OrderDetail from '../pages/mypage/OrderDetail';

/* 관리자 */
import AdminGymList from '../pages/admin/AdminGymList';
import AdminGymForm from '../pages/admin/AdminGymForm';
import AdminMemberList from '../pages/admin/AdminMemberList';
import AdminBoardList from '../pages/admin/AdminBoardList';
import AdminProductList from '../pages/admin/AdminProductList';
import AdminProductForm from '../pages/admin/AdminProductForm';
import AdminOrderList from '../pages/admin/AdminOrderList';
import AdminNoticeList from '../pages/admin/AdminNoticeList';
import AdminNoticeForm from '../pages/admin/AdminNoticeForm';
import AdminAttachList from '../pages/admin/AdminAttachList';

/**
 * 라우팅 구성.
 *
 * [중첩 라우트 구조]
 *  <Route element={<MainLayout />}> 로 감싸면 그 안의 모든 페이지가
 *  헤더/푸터를 공유하고, 페이지만 <Outlet /> 자리에서 교체됩니다.
 *
 * [정적 경로 vs 동적 경로]
 *  /shop/cart 와 /shop/:no 가 함께 있어도 react-router v6는
 *  더 구체적인 정적 경로(/shop/cart)를 우선 매칭하므로 순서를 걱정할 필요가 없습니다.
 *  (v5에서는 순서가 중요했습니다 — 버전 차이 주의)
 */
export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />

      <Routes>
        {/* ================= 사용자 영역 ================= */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/join" element={<Join />} />

          {/* 공지사항 */}
          <Route path="/notice" element={<NoticeList />} />
          <Route path="/notice/:no" element={<NoticeDetail />} />

          {/* 암장 */}
          <Route path="/gym" element={<GymList />} />
          <Route path="/gym/map" element={<GymMap />} />
          <Route path="/gym/:no" element={<GymDetail />} />

          {/* AI 추천 검색 */}
          <Route path="/ai" element={<AiSearch />} />

          {/* 커뮤니티 */}
          <Route path="/community" element={<BoardList />} />
          <Route path="/community/:no" element={<BoardDetail />} />

          {/* 스토어 */}
          <Route path="/shop" element={<ProductList />} />
          <Route path="/shop/cart" element={<Cart />} />
          <Route path="/shop/:no" element={<ProductDetail />} />

          {/* ----- 로그인 필요 ----- */}
          <Route element={<RequireAuth />}>
            {/* 글쓰기/수정 */}
            <Route path="/community/write" element={<BoardForm />} />
            <Route path="/community/:no/edit" element={<BoardForm />} />

            {/* 주문 */}
            <Route path="/shop/order" element={<OrderForm />} />
            <Route path="/shop/order/complete" element={<OrderComplete />} />
            <Route path="/shop/order/toss/success" element={<OrderTossSuccess />} />
            <Route path="/shop/order/toss/fail" element={<OrderTossFail />} />

            {/* 마이페이지 */}
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/mypage/edit" element={<ProfileEdit />} />
            <Route path="/mypage/password" element={<PasswordChange />} />
            <Route path="/mypage/favorite" element={<MyFavorite />} />
            <Route path="/mypage/review" element={<MyReview />} />
            <Route path="/mypage/climblog" element={<ClimbLogList />} />
            <Route path="/mypage/climblog/write" element={<ClimbLogForm />} />
            <Route path="/mypage/climblog/:no/edit" element={<ClimbLogForm />} />
            <Route path="/mypage/report" element={<LevelReport />} />
            <Route path="/mypage/order" element={<MyOrder />} />
            <Route path="/mypage/order/:no" element={<OrderDetail />} />
          </Route>
        </Route>

        {/* ================= 관리자 영역 (등급 1~5만) ================= */}
        <Route element={<RequireAuth adminOnly />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Navigate to="/admin/gym" replace />} />
            <Route path="/admin/gym" element={<AdminGymList />} />
            <Route path="/admin/gym/write" element={<AdminGymForm />} />
            <Route path="/admin/gym/:no/edit" element={<AdminGymForm />} />
            <Route path="/admin/member" element={<AdminMemberList />} />
            <Route path="/admin/board" element={<AdminBoardList />} />
            <Route path="/admin/product" element={<AdminProductList />} />
            <Route path="/admin/product/write" element={<AdminProductForm />} />
            <Route path="/admin/product/:no/edit" element={<AdminProductForm />} />
            <Route path="/admin/order" element={<AdminOrderList />} />
            <Route path="/admin/notice" element={<AdminNoticeList />} />
            <Route path="/admin/notice/write" element={<AdminNoticeForm />} />
            <Route path="/admin/notice/:no/edit" element={<AdminNoticeForm />} />
            <Route path="/admin/attach" element={<AdminAttachList />} />
          </Route>
        </Route>

        {/* 정의되지 않은 주소 */}
        <Route element={<MainLayout />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
