/* ============================================================================
   공지사항(NOTICE) 관련 타입 + 상수
   백엔드 NoticeDTO 와 1:1 매칭
============================================================================ */

export interface NoticeType {
  no: number;
  /** 0:일반 1:이벤트 2:점검 3:업데이트 */
  type: number;
  title: string;
  content: string;
  mno?: number;
  /** 상단 고정 여부 */
  topYn?: string;
  fileyn?: string;
  vcnt?: number;
  cdate?: string;
  udate?: string;
  isdel?: string;
  typeLabel?: string;
  /** 목록 표시용 가상 번호 */
  cnt?: number;
}

export const NOTICE_TYPES = [
  { value: 0, label: '일반' },
  { value: 1, label: '이벤트' },
  { value: 2, label: '점검' },
  { value: 3, label: '업데이트' },
] as const;

export const NOTICE_TYPE_LABEL: Record<number, string> = {
  0: '일반', 1: '이벤트', 2: '점검', 3: '업데이트',
};

/** 공지 유형별 배지 색상 클래스 (common.css의 .badge_xxx) */
export const NOTICE_TYPE_BADGE: Record<number, string> = {
  0: 'badge_muted',
  1: 'badge_accent',
  2: 'badge_warn',
  3: 'badge_info',
};

export const NOTICE_TNAME = 'NOTICE';
