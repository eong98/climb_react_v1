/* ============================================================================
   등반일지(CLIMB_LOG) 관련 타입 + 상수
   백엔드 ClimbLogDTO / ClimbLogStatsDTO 와 1:1 매칭
============================================================================ */

/** 등반일지 1건 */
export interface ClimbLogType {
  no?: number;
  mno?: number;
  /** 암장번호 (직접 입력이면 없음) */
  gno?: number;
  /** 암장명 직접 입력분 */
  gymName?: string;
  /** 등반일 (yyyy-MM-dd) */
  logDate: string;
  /** 0:볼더링 1:리드 2:탑로프 */
  climbType: number;
  gradeSystem?: string;
  gradeCode?: string;
  /** 정규화 난이도 점수 (서버가 계산) */
  sortOrder?: number;
  tryCnt?: number;
  sendCnt?: number;
  durationMin?: number;
  /** 컨디션 1~5 */
  conditionScore?: number;
  memo?: string;
  cdate?: string;
  udate?: string;
  /* 조인/계산값 */
  gname?: string;
  levelLabel?: string;
}

/** 월별 통계 */
export interface MonthlyStat {
  /** yyyy-MM */
  yearMonth: string;
  logCnt: number;
  sendCnt: number;
  maxSortOrder: number;
  maxLevelLabel?: string;
}

/** 난이도별 분포 */
export interface GradeStat {
  gradeSystem?: string;
  gradeCode?: string;
  sortOrder: number;
  levelLabel?: string;
  sendCnt: number;
  logCnt: number;
}

/** 등반 통계 (GET /climblog/stats) */
export interface ClimbLogStatsType {
  /** 등반한 날짜 수 (중복 제거) */
  totalDays: number;
  /** 일지 건수 */
  totalLogs: number;
  totalSend: number;
  totalTry: number;
  /** 완등률 (%) */
  successRate: number;
  maxGradeCode?: string;
  maxGradeSystem?: string;
  maxSortOrder: number;
  maxLevelLabel?: string;
  recent30Days: number;
  totalDurationMin: number;
  monthly: MonthlyStat[];
  gradeDistribution: GradeStat[];
}

/* ==========================================================================
   상수
========================================================================== */

/** 등반 종류 */
export const CLIMB_TYPES = [
  { value: 0, label: '볼더링', icon: '🧗' },
  { value: 1, label: '리드', icon: '🪢' },
  { value: 2, label: '탑로프', icon: '⛓️' },
] as const;

export const CLIMB_TYPE_LABEL: Record<number, string> = {
  0: '볼더링', 1: '리드', 2: '탑로프',
};

/** 컨디션 라벨 */
export const CONDITION_LABEL: Record<number, string> = {
  1: '최악', 2: '별로', 3: '보통', 4: '좋음', 5: '최상',
};

/** 등반일지 작성 폼 초기값 */
export const EMPTY_CLIMB_LOG: ClimbLogType = {
  logDate: '',
  climbType: 0,
  gradeSystem: 'COLOR',
  gradeCode: '',
  tryCnt: 0,
  sendCnt: 0,
  durationMin: 90,
  conditionScore: 3,
  memo: '',
};
