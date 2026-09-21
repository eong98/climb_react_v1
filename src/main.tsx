import { createRoot } from 'react-dom/client'

import './styles/normalize.css'  /* 브라우저 기본 스타일 초기화 */
import './index.css'             /* 디자인 토큰(CSS 변수) + 전역 기본 스타일 */

import App from './routes/App'

// React 19 기준 진입점.
// React 18부터 ReactDOM.render() 대신 createRoot()를 사용합니다.
// (동시성 기능을 쓰려면 createRoot가 필수라 구버전 API는 제거되었습니다)
createRoot(document.getElementById('root')!).render(
  <App />
)
