import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 설정
// - server.port: 개발 서버 포트 (팀 프로젝트와 겹치지 않게 5173 사용)
// - server.host: true로 두면 같은 공유기(내부망)의 다른 기기에서도 접속 가능 (모바일 확인용)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
})
