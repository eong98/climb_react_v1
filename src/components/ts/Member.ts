/* ============================================================================
   회원(MEMBER) 관련 타입 + 상수
   백엔드 MemberDTO 와 1:1 매칭
============================================================================ */

export interface MemberType {
  no?: number;
  id: string;
  /** 응답에는 내려오지 않습니다. 가입/수정 요청에만 사용 */
  password?: string;
  mname: string;
  nickname: string;
  email: string;
  phone?: string;
  zipcode?: string;
  addr?: string;
  addrDetail?: string;
  /** 1~5 관리자 / 6~10 회원 */
  grade?: number;
  /** 0:정지 1:정상 2:탈퇴 */
  status?: number;
  profileImg?: string;
  /** 볼더링 자가 등급 (V0~V12) */
  boulderLevel?: string;
  /** 리드 자가 등급 (5.9~5.14a) */
  leadLevel?: string;
  climbStartYear?: number;
  prefSido?: string;
  prefSigungu?: string;
  intro?: string;
  termsAgreeYn?: string;
  privacyAgreeYn?: string;
  marketingAgreeYn?: string;
  cdate?: string;
  udate?: string;
  lastLogin?: string;
  /* 서버 계산값 */
  /** 구력 (년) — climbStartYear로 계산 */
  careerYears?: number;
  profileImgUrl?: string;
  /* 비밀번호 변경용 */
  currentPassword?: string;
  newPassword?: string;
}

/** 로그인 응답 (POST /member/login) */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  member: MemberType;
}

/* ==========================================================================
   상수
========================================================================== */

/** 회원 등급 라벨 */
export const GRADE_LABEL: Record<number, string> = {
  1: '최고관리자',
  2: '운영자',
  3: '운영자',
  4: '운영자',
  5: '운영자',
  6: '일반회원',
  7: '일반회원',
  8: '일반회원',
  9: '일반회원',
  10: '암장 사업자',
  99: '비회원',
};

/** 회원 상태 라벨 */
export const MEMBER_STATUS_LABEL: Record<number, string> = {
  0: '정지',
  1: '정상',
  2: '탈퇴',
};

/** 볼더링 자가 등급 선택 옵션 */
export const BOULDER_LEVELS = [
  'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10',
] as const;

/** 리드 자가 등급 선택 옵션 */
export const LEAD_LEVELS = [
  '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d',
  '5.11a', '5.11b', '5.11c', '5.11d', '5.12a', '5.12b', '5.13a',
] as const;

/** 회원가입 폼 초기값 */
export const EMPTY_MEMBER: MemberType = {
  id: '', password: '', mname: '', nickname: '', email: '',
  phone: '', zipcode: '', addr: '', addrDetail: '',
  boulderLevel: '', leadLevel: '', prefSido: '', prefSigungu: '', intro: '',
  termsAgreeYn: 'N', privacyAgreeYn: 'N', marketingAgreeYn: 'N',
};

/** 관리자 회원 검색 필터 */
export interface MemberFilters {
  word: string;
  grade: string;
  status: string;
}

export const EMPTY_MEMBER_FILTERS: MemberFilters = { word: '', grade: '', status: '' };
