/* ============================================================================
   커뮤니티(BOARD) 관련 타입 + 상수
   백엔드 BoardDTO / BoardCommentDTO 와 1:1 매칭
============================================================================ */

/** 게시글 (백엔드 BoardDTO) */
export interface BoardType {
  no: number;
  /** 0:자유 1:파트너구함 2:암장후기 3:질문답변 4:중고거래 */
  type: number;
  mno?: number;
  title: string;
  content: string;
  /** 연관 암장번호 (후기/파트너모집) */
  gno?: number;
  sido?: string;
  meetDate?: string;
  dealPrice?: number;
  /** 0:판매중 1:예약중 2:완료 */
  dealStatus?: number;
  vcnt?: number;
  likeCnt?: number;
  replyCnt?: number;
  fileyn?: string;
  noticeYn?: string;
  status?: number;
  cdate?: string;
  udate?: string;
  /* 조인 정보 */
  nickname?: string;
  profileImg?: string;
  boulderLevel?: string;
  gname?: string;
  /* 화면용 */
  liked?: boolean;
  editable?: boolean;
  /** 목록에서 화면에 표시할 가상 번호 (전체 개수 기준 역순) */
  cnt?: number;
}

/** 댓글 (백엔드 BoardCommentDTO) */
export interface CommentType {
  no: number;
  bno: number;
  mno?: number;
  parentNo?: number;
  content: string;
  likeCnt?: number;
  cdate?: string;
  udate?: string;
  isdel?: string;
  nickname?: string;
  profileImg?: string;
  /** 대댓글 여부 (parentNo가 있으면 true) */
  reply?: boolean;
  editable?: boolean;
}

/* ==========================================================================
   상수
========================================================================== */

/** 게시판 종류 */
export const BOARD_TYPES = [
  { value: 0, label: '자유게시판', icon: '💬', desc: '클라이밍 이야기를 자유롭게' },
  { value: 1, label: '파트너 구해요', icon: '🤝', desc: '같이 등반할 사람을 찾아요' },
  { value: 2, label: '암장 후기', icon: '📝', desc: '다녀온 암장 생생 후기' },
  { value: 3, label: '질문 & 답변', icon: '❓', desc: '궁금한 건 물어보세요' },
  { value: 4, label: '중고거래', icon: '🛒', desc: '장비 사고팔기' },
] as const;

export const BOARD_TYPE_LABEL: Record<number, string> = {
  0: '자유게시판',
  1: '파트너 구해요',
  2: '암장 후기',
  3: '질문 & 답변',
  4: '중고거래',
};

/** 중고거래 상태 */
export const DEAL_STATUS_LABEL: Record<number, string> = {
  0: '판매중',
  1: '예약중',
  2: '거래완료',
};

/** 검색 조건 종류 */
export const SEARCH_TYPE_OPTIONS = [
  { value: 'title', label: '제목' },
  { value: 'content', label: '내용' },
  { value: 'writer', label: '작성자' },
] as const;

/** 정렬 옵션 */
export const BOARD_SORT_OPTIONS = [
  { value: 'new', label: '최신순' },
  { value: 'view', label: '조회순' },
  { value: 'like', label: '좋아요순' },
  { value: 'reply', label: '댓글순' },
] as const;

/** 목록 검색 필터 (GET /board/list 쿼리 파라미터와 1:1) */
export interface BoardFilters {
  word: string;
  searchType: string; // title | content | writer
  sido: string;
  sort: string;
}

export const EMPTY_BOARD_FILTERS: BoardFilters = {
  word: '',
  searchType: 'title',
  sido: '',
  sort: 'new',
};

/** 첨부파일 저장 폴더명 (ATTACH.TNAME) */
export const BOARD_TNAME = 'BOARD';
