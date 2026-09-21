/* ============================================================================
   첨부파일(ATTACH) 관련 타입 + 상수
   백엔드 AttachDTO 와 1:1 매칭
============================================================================ */

export interface AttachType {
  no: number;
  /** 등록 테이블명(대문자) = 저장 폴더명 (BOARD, GYM_REVIEW, PRODUCT ...) */
  tname: string;
  /** 원글 번호 */
  bno: number;
  /** 0: 이미지, 1: 일반 파일 */
  type: number;
  /** 원본 파일명 */
  name: string;
  /** 파일 크기 (byte) */
  fsize: number;
  /** 서버 저장 파일명 (UUID) */
  sname: string;
  /** 썸네일 파일명 */
  thumb?: string;
  /** 상대 저장 경로 (/attach/storage/BOARD/images) */
  purl: string;
  mno?: number;
  cdate?: string;
  /* 서버가 만들어주는 접근 URL */
  url?: string;
  thumbUrl?: string;
}

/** 파일 종류 라벨 */
export const ATTACH_TYPE_LABEL: Record<number, string> = {
  0: '이미지',
  1: '파일',
};

/**
 * 첨부파일을 사용하는 테이블 목록 (관리자 첨부 관리 화면의 필터 선택지)
 * 새 게시판을 추가하면 여기에도 등록하세요.
 */
export const ATTACH_TNAMES = [
  { value: 'BOARD', label: '커뮤니티' },
  { value: 'NOTICE', label: '공지사항' },
  { value: 'GYM_REVIEW', label: '암장 리뷰' },
  { value: 'PRODUCT', label: '상품' },
  { value: 'PRODUCT_REVIEW', label: '상품 후기' },
] as const;

/** 업로드 제한 (백엔드 application.properties의 multipart 설정과 맞출 것) */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;   // 20MB
export const MAX_FILE_COUNT = 5;

/** 허용 확장자 */
export const ALLOWED_EXT = [
  'jpg', 'jpeg', 'png', 'gif', 'webp',
  'pdf', 'zip', 'hwp', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
];

/** 관리자 첨부 검색 필터 */
export interface AttachFilters {
  word: string;
  tname: string;
  type: string;
}

export const EMPTY_ATTACH_FILTERS: AttachFilters = { word: '', tname: '', type: '' };
