import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/* ============================================================================
   로그인 상태 전역 저장소 (zustand)

   [왜 zustand를 쓰나]
   로그인 정보(토큰, 닉네임, 등급)는 헤더·마이페이지·글쓰기 등 앱 전체에서 필요합니다.
   props로 계속 내려주면(prop drilling) 중간 컴포넌트가 쓰지도 않는 값을 전달만 하게 됩니다.
   Redux는 설정할 게 많아서, 작은 프로젝트에는 zustand가 가볍고 편합니다.

   [왜 sessionStorage인가]
   - localStorage: 브라우저를 닫아도 유지 → 공용 PC에서 로그인이 남아 위험
   - sessionStorage: 탭을 닫으면 사라짐 → 이 프로젝트는 이 방식 채택
   [실무 팁] 보안을 더 신경 쓴다면 액세스 토큰은 메모리에만 두고,
   리프레시 토큰은 httpOnly 쿠키에 담아 자바스크립트가 못 읽게 하는 방식을 씁니다.
   (httpOnly 쿠키는 XSS로 탈취할 수 없습니다)
============================================================================ */

interface SessionStore {
  /** 로그인 여부 */
  login: boolean;
  /** 회원번호 (MEMBER.NO) — 0이면 비회원 */
  no: number;
  /** 로그인 아이디 */
  id: string;
  /** 닉네임 (커뮤니티 노출명) */
  nickname: string;
  /** 등급 (1~5 관리자 / 6~10 회원 / 99 비회원) */
  grade: number;
  /** 프로필 이미지 파일명 */
  profileImg: string;

  accessToken: string;
  refreshToken: string;

  /** 로그인 성공 시 한 번에 세팅 */
  setLogin: (payload: {
    no: number; id: string; nickname: string; grade: number; profileImg?: string;
    accessToken: string; refreshToken: string;
  }) => void;
  /** 토큰만 교체 (재발급 시) */
  setTokens: (accessToken: string, refreshToken: string) => void;
  /** 프로필 정보만 갱신 (내 정보 수정 후) */
  setProfile: (nickname: string, profileImg?: string) => void;
  /** 로그아웃 */
  clearAuth: () => void;
}

export const GlobalStoreSession = create<SessionStore>()(
  persist(
    (set) => ({
      login: false,
      no: 0,
      id: '',
      nickname: '',
      grade: 99,
      profileImg: '',
      accessToken: '',
      refreshToken: '',

      setLogin: ({ no, id, nickname, grade, profileImg, accessToken, refreshToken }) =>
        set({
          login: true,
          no, id, nickname, grade,
          profileImg: profileImg ?? '',
          accessToken, refreshToken,
        }),

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      setProfile: (nickname, profileImg) =>
        set((state) => ({ nickname, profileImg: profileImg ?? state.profileImg })),

      clearAuth: () =>
        set({
          login: false, no: 0, id: '', nickname: '', grade: 99, profileImg: '',
          accessToken: '', refreshToken: '',
        }),
    }),
    {
      name: 'climbon-auth',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

/** 관리자(등급 1~5)인지 판별하는 헬퍼 */
export const isAdminGrade = (grade: number) => grade >= 1 && grade <= 5;
