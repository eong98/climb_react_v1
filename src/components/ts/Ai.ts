/* ============================================================================
   AI 기능 관련 타입
   Spring(/ai/**)이 FastAPI 응답을 그대로 전달하므로,
   FastAPI 스키마의 필드명(snake_case가 섞여 있음)을 그대로 따릅니다.

   [실무 팁] 자바는 camelCase, 파이썬은 snake_case가 관례라 두 서버를 연동하면
   이런 혼재가 생깁니다. 해결책은 두 가지입니다.
     1) 중간(Spring)에서 필드명을 변환해 프론트에는 camelCase만 노출
     2) 프록시 성격이면 그대로 전달하고 프론트가 받아들임 (이 프로젝트의 선택)
   1번이 더 깔끔하지만 AI 응답 스키마가 자주 바뀌는 초기 단계에서는
   변환 코드를 계속 고쳐야 해서, 여기서는 2번을 택하고 타입으로 명시했습니다.
============================================================================ */

import type { GymType } from './Gym';

/** AI 서버 연결 실패 시 공통으로 붙는 필드 */
export interface AiBase {
  /** false면 AI 서버에 연결하지 못한 상태 */
  available?: boolean;
  /** LLM 없이 규칙 기반으로 응답한 경우 true */
  fallback?: boolean;
  message?: string;
}

/* ==========================================================================
   1. 자연어 암장 검색 (POST /ai/search)
========================================================================== */

/** LLM이 추출한 검색 필터 */
export interface AiSearchFilters {
  sido?: string | null;
  sigungu?: string | null;
  type?: number | null;
  levelMin?: number | null;
  levelMax?: number | null;
  parking?: string | null;
  shower?: string | null;
  locker?: string | null;
  lesson?: string | null;
  keyword?: string | null;
}

export interface AiSearchResponse extends AiBase {
  filters?: AiSearchFilters;
  keywords?: string[];
  /** 추출된 조건으로 실제 DB에서 찾은 암장 목록 (Spring이 채워줌) */
  gyms?: GymType[];
}

/* ==========================================================================
   2. 챗봇 (POST /ai/chat, GET /ai/chat/{sessionId})
========================================================================== */

export interface ChatSource {
  id: string;
  title: string;
}

export interface AiChatResponse extends AiBase {
  answer?: string;
  /** GYM_SEARCH | RECOMMEND | QNA | PRODUCT | ETC */
  intent?: string;
  sources?: ChatSource[];
}

/** 화면에 표시할 대화 1줄 */
export interface ChatMessage {
  no?: number;
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  cdate?: string;
}

/* ==========================================================================
   3. 리뷰 요약 (GET /ai/review-summary/{gno})
========================================================================== */

export interface AiReviewSummary extends AiBase {
  gno?: number;
  summary?: string;
  /** POSITIVE | NEUTRAL | NEGATIVE */
  sentiment?: string;
  positive_points?: string[];
  negative_points?: string[];
  keywords?: string[];
  review_count?: number;
  rating_avg?: number;
}

/* ==========================================================================
   4. 실력 분석 리포트 (GET /ai/level-report)
========================================================================== */

export interface AiReportStats {
  total_logs?: number;
  total_send?: number;
  total_try?: number;
  success_rate?: number;
  max_sort_order?: number;
  max_grade_code?: string;
  avg_per_week?: number;
  /** UP | FLAT | DOWN */
  trend?: string;
  [key: string]: unknown;
}

export interface AiLevelReport extends AiBase {
  stats?: AiReportStats;
  level?: string;
  strength?: string[];
  weakness?: string[];
  next_goal?: string;
  advice?: string;
  training?: string[];
}

/* ==========================================================================
   5. 맞춤 추천 (GET /ai/recommend/gym, /ai/recommend/product)
========================================================================== */

export interface AiRecommendItem {
  no: number;
  name: string;
  /** 0~100 추천 점수 */
  score: number;
  reason?: string;
}

export interface AiRecommendResponse extends AiBase {
  items?: AiRecommendItem[];
}

/* ==========================================================================
   상수
========================================================================== */

/** 감성 분석 결과 라벨 */
export const SENTIMENT_LABEL: Record<string, string> = {
  POSITIVE: '긍정적',
  NEUTRAL: '보통',
  NEGATIVE: '부정적',
};

export const SENTIMENT_BADGE: Record<string, string> = {
  POSITIVE: 'badge_primary',
  NEUTRAL: 'badge_muted',
  NEGATIVE: 'badge_danger',
};

/** 추세 라벨 */
export const TREND_LABEL: Record<string, string> = {
  UP: '상승세 📈',
  FLAT: '유지 ➡️',
  DOWN: '주춤 📉',
};

/** AI 검색 예시 문장 (검색창 placeholder / 추천 칩에 사용) */
export const AI_SEARCH_EXAMPLES = [
  '서울 강남에서 초보자도 할 수 있는 볼더링장 주차되는 곳',
  '경기도에서 샤워실 있고 강습하는 암장',
  '중급자가 갈 만한 리드 암장 추천해줘',
  '주말에 갈 만한 자연 암장 알려줘',
];

/** AI 서버가 꺼져 있을 때 보여줄 안내 문구 */
export const AI_OFFLINE_MESSAGE =
  'AI 서버에 연결할 수 없습니다. FastAPI 서버(포트 11300)가 실행 중인지 확인해주세요.';
