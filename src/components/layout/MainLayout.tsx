import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import ChatBotWidget from '../ui/ChatBotWidget';

/**
 * 일반 사용자 화면 공통 레이아웃.
 *
 * react-router의 <Outlet />이 자식 라우트가 그려질 자리입니다.
 * 이렇게 만들면 페이지를 옮겨도 헤더/푸터는 다시 그려지지 않아
 * 화면 깜빡임이 없고 성능도 좋습니다.
 */
export default function MainLayout() {
  return (
    <>
      <Header />
      <main className="main_area">
        <Outlet />
      </main>
      <Footer />
      <ChatBotWidget />
    </>
  );
}
