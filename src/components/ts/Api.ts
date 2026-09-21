/* ============================================================================
   API 공통 타입
   백엔드 dev.jpa.climbon.tool.PageResponse 와 1:1로 대응됩니다.
============================================================================ */

/** 페이징 응답 공통 포맷 */
export interface PageResponse<T> {
  /** 현재 페이지 데이터 목록 */
  content: T[];
  /** 현재 페이지 번호 (0부터 시작) — 프론트는 1부터 쓰므로 변환 주의 */
  page: number;
  /** 한 페이지 크기 */
  size: number;
  /** 전체 데이터 수 */
  totalElements: number;
  /** 전체 페이지 수 */
  totalPages: number;
}

/** 비어 있는 페이징 응답 (조회 실패 시 초기화용) */
export const EMPTY_PAGE = <T,>(size = 10): PageResponse<T> => ({
  content: [],
  page: 0,
  size,
  totalElements: 0,
  totalPages: 0,
});

/** 서버가 처리 결과를 알려줄 때의 공통 응답 */
export interface ResultResponse {
  message?: string;
  [key: string]: unknown;
}

/** 목록 화면 기본 페이지 크기 */
export const PAGE_SIZE = 10;
export const CARD_PAGE_SIZE = 12;
