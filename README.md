# climb_react_v1 — CLIMB:ON 프론트엔드 (React + TypeScript)

React 19 · TypeScript · Vite · react-router-dom v6 · zustand · axios

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입체크(tsc -b) + 프로덕션 빌드
```

백엔드 주소는 `src/utils/Tool.ts`의 `getIP()` **한 곳만** 수정하면 됩니다.

```ts
export const getIP = () => 'localhost';   // 학원/집/배포 환경에 맞게 변경
```

## 디렉터리 구조

```
src/
├── main.tsx
├── index.css              디자인 토큰(CSS 변수) — 색상·간격·폰트 정의
├── routes/
│   ├── App.tsx            전체 라우팅
│   └── RequireAuth.tsx    로그인/관리자 권한 가드
├── components/
│   ├── layout/            MainLayout · AdminLayout · Header · Footer
│   ├── ui/                공통 컴포넌트 (index.ts에서 일괄 export)
│   └── ts/                API 응답 타입 + 상수 (백엔드 DTO와 1:1)
├── hooks/                 usePaging · useTab · useAlert
├── store/                 LoginStore(zustand) · CartStore
├── utils/Tool.ts          axiosInstance · 포맷 함수 · 난이도 변환
├── pages/                 main / gym / community / shop / mypage / admin
└── styles/                normalize · common · layout + 페이지별 CSS
```

## 개발 규칙

1. **API 호출은 반드시 `axiosInstance`** — JWT 헤더 자동 첨부 + 401 시 토큰 자동 재발급
2. **타입은 `components/ts/`에 정의** — 백엔드 DTO 필드명과 1:1로 맞춥니다
3. **`window.alert` / `confirm` 금지** — `useAlert` + `AlertModal` / `ConfirmModal` 사용
4. **검색은 draft/applied 2단 상태** — 타이핑 중에는 조회하지 않고 엔터/버튼에서만 조회
5. **목록 상태는 URL 쿼리에** — 뒤로가기·새로고침·링크 공유 시 필터와 페이지가 유지됩니다
6. **스타일은 CSS 변수 기반 클래스 재사용** — `common.css`에 없는 것만 페이지 CSS에 추가
7. **타입 import는 `import type { ... }`** — `verbatimModuleSyntax` 설정 때문

## 디자인 시스템

다크 테마. 클라이밍장의 **콘크리트 벽 + 형광 홀드** 분위기.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#0B0D10` | 배경 |
| `--surface` | `#151A20` | 카드 |
| `--primary` | `#C8FF3D` | 라임 (버튼·강조) |
| `--accent` | `#FF6B35` | 오렌지 (CTA·찜) |
| `--text` | `#F2F4F6` | 초크 화이트 |

난이도 배지는 국내 실내 암장의 색상 난이도(흰–노랑–주황–초록–파랑–빨강–보라–회색–갈색–검정)를 실제 색으로 표현합니다.

## 주요 화면

| 경로 | 화면 |
|---|---|
| `/` | 메인 (인기/신규 암장, 난이도별 바로가기, 인기글, 베스트 상품) |
| `/gym` `/gym/:no` `/gym/map` | 암장 검색 · 상세 · 지도 |
| `/ai` | AI 자연어 검색 |
| `/community` … | 커뮤니티 (5개 게시판) |
| `/shop` … | 스토어 · 장바구니 · 주문 |
| `/mypage` … | 마이페이지 · 등반일지 · AI 실력분석 · 주문내역 |
| `/admin/*` | 관리자 (등급 1~5만) |
