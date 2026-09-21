import { Link } from 'react-router-dom';
import { getCopyright } from '../../utils/Tool';

/** 하단 푸터 (모든 페이지 공통) */
export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer_top">
          <div>
            <p className="logo">CLIMB<span>:</span>ON</p>
            <p className="t-sm t-faint mt8">
              실내 볼더링장부터 자연 암장까지,<br />
              내 지역 클라이밍 장소를 난이도별로 찾아보세요.
            </p>
          </div>

          <div className="footer_links">
            <div>
              <h5>서비스</h5>
              <Link to="/gym">암장 찾기</Link>
              <Link to="/ai">AI 추천</Link>
              <Link to="/community">커뮤니티</Link>
              <Link to="/shop">스토어</Link>
            </div>
            <div>
              <h5>고객지원</h5>
              <Link to="/notice">공지사항</Link>
              <Link to="/mypage">마이페이지</Link>
              <Link to="/mypage/climblog">등반일지</Link>
            </div>
            <div>
              <h5>기술 스택</h5>
              <span>Spring Boot · JPA</span>
              <span>React · TypeScript</span>
              <span>FastAPI · LangChain</span>
              <span>Oracle Database</span>
            </div>
          </div>
        </div>

        <div className="footer_bottom">
          <p className="t-xs t-faint">{getCopyright()}</p>
          <p className="t-xs t-faint">
            본 사이트는 학습용 포트폴리오이며 실제 예약·결제는 이루어지지 않습니다.
          </p>
        </div>
      </div>
    </footer>
  );
}
