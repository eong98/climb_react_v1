/* ============================================================================
   암장(GYM) 관련 타입 + 상수
   백엔드 GymDTO / GymDetailDTO / GymHourDTO / GymGradeDTO / GymReviewDTO 와 1:1 매칭
============================================================================ */

/** 암장 기본 정보 (백엔드 GymDTO) */
export interface GymType {
  no: number;
  gname: string;
  /** 0: 실내볼더링, 1: 실내리드, 2: 자연바위, 3: 야외리드 */
  type: number;
  brand?: string;

  /* 위치 */
  sido: string;
  sigungu?: string;
  zipcode?: string;
  addr: string;
  addrDetail?: string;
  lat?: number;
  lng?: number;
  subwayInfo?: string;

  /* 연락처 */
  phone?: string;
  homepage?: string;
  intro?: string;

  /* 시설 (Y/N) */
  parkingYn?: string;
  parkingInfo?: string;
  showerYn?: string;
  lockerYn?: string;
  shoeRentYn?: string;
  lessonYn?: string;
  kidsYn?: string;
  wifiYn?: string;

  /* 요금 */
  daypassPrice?: number;
  monthPrice?: number;
  shoeRentPrice?: number;
  priceInfo?: string;

  /* 규모 */
  wallHeight?: number;
  areaSize?: number;
  routeTotal?: number;
  settingCycle?: string;

  /* 자연암장 전용 */
  rockType?: string;
  approachInfo?: string;
  bestSeason?: string;
  boltInfo?: string;

  /* 운영/통계 */
  holidayInfo?: string;
  thumb?: string;
  vcnt?: number;
  ratingAvg?: number;
  reviewCnt?: number;
  favoriteCnt?: number;
  /** 0: 휴업, 1: 영업중, 2: 폐업 */
  status?: number;
  mno?: number;
  cdate?: string;
  udate?: string;
  isdel?: string;

  /* 화면 표시용 (서버가 계산해서 내려줌) */
  favorite?: boolean;
  levelRange?: string;
  openNow?: boolean;
}

/** 영업시간 (백엔드 GymHourDTO) */
export interface GymHourType {
  no?: number;
  gno?: number;
  /** 0(일) ~ 6(토) */
  dayOfWeek: number;
  openTime?: string;
  closeTime?: string;
  closedYn?: string;
  note?: string;
  dayLabel?: string;
}

/** 난이도 구성 (백엔드 GymGradeDTO) */
export interface GymGradeType {
  no?: number;
  gno?: number;
  /** V / YDS / FRENCH / COLOR */
  gradeSystem: string;
  gradeCode: string;
  gradeLabel?: string;
  sortOrder?: number;
  routeCnt?: number;
  setDate?: string;
  note?: string;
  levelLabel?: string;
}

/** 암장 리뷰 (백엔드 GymReviewDTO) */
export interface GymReviewType {
  no?: number;
  gno: number;
  mno?: number;
  rating: number;
  scoreFacility?: number;
  scoreRoute?: number;
  scoreClean?: number;
  title?: string;
  content: string;
  visitDate?: string;
  likeCnt?: number;
  fileyn?: string;
  cdate?: string;
  udate?: string;
  /* 조인해서 내려오는 작성자 정보 */
  nickname?: string;
  profileImg?: string;
  boulderLevel?: string;
  gname?: string;
}

/** 암장 상세 응답 (백엔드 GymDetailDTO) */
export interface GymDetailType {
  gym: GymType;
  hours: GymHourType[];
  grades: GymGradeType[];
  reviews: GymReviewType[];
  favorite: boolean;
  levelRange?: string;
  openNow?: boolean;
}

/** 지도 마커용 경량 타입 (백엔드 GymMarkerDTO) */
export interface GymMarkerType {
  no: number;
  gname: string;
  type: number;
  lat: number;
  lng: number;
  ratingAvg?: number;
  thumb?: string;
}

/** 지역 (백엔드 RegionDTO) */
export interface RegionType {
  no: number;
  sido: string;
  sigungu?: string;
  sortOrder?: number;
  useYn?: string;
}

/* ==========================================================================
   상수
========================================================================== */

/** 암장 유형 라벨 */
export const GYM_TYPE_LABEL: Record<number, string> = {
  0: '실내 볼더링',
  1: '실내 리드',
  2: '자연 바위',
  3: '야외 리드',
};

/** 암장 유형 선택 옵션 (필터/등록폼 공용) */
export const GYM_TYPE_OPTIONS = [
  { value: 0, label: '실내 볼더링', desc: '로프 없이 낮은 벽을 오르는 볼더링장' },
  { value: 1, label: '실내 리드', desc: '로프를 걸고 오르는 높은 실내 암장' },
  { value: 2, label: '자연 바위', desc: '야외 자연 암벽 볼더링' },
  { value: 3, label: '야외 리드', desc: '볼트가 설치된 야외 스포츠 클라이밍' },
] as const;

/** 영업상태 라벨 */
export const GYM_STATUS_LABEL: Record<number, string> = {
  0: '휴업',
  1: '영업중',
  2: '폐업',
};

/** 요일 라벨 (DAY_OF_WEEK 0=일) */
export const DAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 정렬 옵션 */
export const GYM_SORT_OPTIONS = [
  { value: 'rating', label: '평점 높은순' },
  { value: 'review', label: '리뷰 많은순' },
  { value: 'new', label: '최근 등록순' },
  { value: 'name', label: '이름순' },
] as const;

/** 시설 필터 항목 (체크박스 목록 생성에 사용) */
export const FACILITY_FILTERS = [
  { key: 'parking', label: '주차 가능', icon: '🅿️' },
  { key: 'shower', label: '샤워실', icon: '🚿' },
  { key: 'locker', label: '락커', icon: '🔐' },
  { key: 'shoeRent', label: '암벽화 대여', icon: '👟' },
  { key: 'lesson', label: '강습 운영', icon: '🧗' },
] as const;

/** 암장 검색 필터 (GET /gym/list 쿼리 파라미터와 1:1) */
export interface GymFilters {
  word: string;
  type: string;       // '' | '0' ~ '3'
  sido: string;
  sigungu: string;
  levelMin: string;   // '' | '0' ~ '100'
  levelMax: string;
  parking: string;    // '' | 'Y'
  shower: string;
  locker: string;
  shoeRent: string;
  lesson: string;
  openNow: string;    // '' | 'Y'
  sort: string;       // rating | review | new | name
}

export const EMPTY_GYM_FILTERS: GymFilters = {
  word: '', type: '', sido: '', sigungu: '',
  levelMin: '', levelMax: '',
  parking: '', shower: '', locker: '', shoeRent: '', lesson: '',
  openNow: '', sort: 'rating',
};

/** 난이도 체계 선택 옵션 (등반일지/암장 난이도 등록에서 사용) */
export const GRADE_SYSTEM_OPTIONS = [
  { value: 'COLOR', label: '색상 (국내 실내암장)' },
  { value: 'V', label: 'V등급 (볼더링)' },
  { value: 'YDS', label: '5.x (미국식 리드)' },
  { value: 'FRENCH', label: '6a (프랑스식)' },
] as const;

/** 체계별 선택 가능한 난이도 코드 */
export const GRADE_CODES: Record<string, string[]> = {
  COLOR: ['흰색', '노랑', '주황', '초록', '파랑', '빨강', '보라', '회색', '갈색', '검정'],
  V: ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10'],
  YDS: ['5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d',
        '5.12a', '5.12b', '5.12c', '5.13a', '5.13b'],
  FRENCH: ['5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7c', '8a'],
};
