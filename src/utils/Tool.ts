import axios from 'axios';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { GlobalStoreSession } from '../store/LoginStore';

/* ============================================================================
   CLIMB:ON 프론트엔드 공통 유틸
   - API 통신은 반드시 이 파일의 axiosInstance를 통해서 합니다.
   - 날짜/숫자 포맷, 난이도 변환 같은 공용 함수도 여기 모읍니다.
============================================================================ */

/* ==========================================================================
   1. 서버 주소
========================================================================== */

/** 백엔드(Spring Boot) 서버 IP. 학원/집/배포 환경에 따라 여기만 바꾸면 됩니다. */
export const getIP = () => {
  return 'localhost';
  // return '192.168.0.10';  // 같은 공유기의 다른 PC에서 접속할 때
};

/** Spring Boot API 서버 주소 (포트는 application.properties의 server.port와 동일) */
export const API_BASE = `http://${getIP()}:9200`;

export const getCopyright = () => '© 2026 CLIMB:ON — 개인 포트폴리오 프로젝트';

/* ==========================================================================
   2. axios 인스턴스

   [왜 인스턴스를 따로 만드나]
   axios를 그냥 쓰면 컴포넌트마다 주소와 토큰 헤더를 매번 써야 합니다.
   인스턴스를 만들어 baseURL과 인터셉터를 한 번만 설정해두면
   페이지에서는 axiosInstance.get('/gym/list') 처럼 짧게 쓸 수 있고,
   서버 주소가 바뀌어도 이 파일 한 곳만 고치면 됩니다.
========================================================================== */
export const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

/**
 * [요청 인터셉터] 모든 요청에 JWT 액세스 토큰을 자동으로 붙입니다.
 *
 * 이게 없으면 로그인이 필요한 API를 호출할 때마다
 * headers: { Authorization: `Bearer ${token}` } 를 직접 써야 합니다.
 */
axiosInstance.interceptors.request.use(
  (config) => {
    const { accessToken } = GlobalStoreSession.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * [응답 인터셉터] 401(토큰 만료)이 오면 리프레시 토큰으로 재발급 후 원래 요청을 다시 보냅니다.
 *
 * [면접 포인트] 액세스 토큰을 짧게(30분) 두는 이유는 탈취됐을 때 피해 시간을 줄이기 위해서입니다.
 * 대신 사용자가 30분마다 로그인하면 불편하니, 수명이 긴 리프레시 토큰(2주)으로
 * 조용히 재발급 받아 사용자는 끊김을 느끼지 않게 만듭니다. 이 처리를 인터셉터에 두면
 * 모든 API가 자동으로 혜택을 봅니다.
 *
 * _retry 플래그: 재발급 후 다시 보낸 요청이 또 401이면 무한 루프에 빠지므로
 * "이미 한 번 재시도했다"는 표시를 남겨 두 번은 시도하지 않습니다.
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status === 401 && original && !original._retry) {
      original._retry = true;

      const { refreshToken, setTokens, clearAuth } = GlobalStoreSession.getState();
      if (!refreshToken) {
        clearAuth();
        return Promise.reject(error);
      }

      try {
        // 재발급 요청에는 만료된 토큰이 붙으면 안 되므로 기본 axios를 사용합니다.
        const res = await axios.post(`${API_BASE}/auth/reissue`, { refreshToken });
        const newAccess = res.data.accessToken;
        const newRefresh = res.data.refreshToken ?? refreshToken;

        setTokens(newAccess, newRefresh);
        original.headers.Authorization = `Bearer ${newAccess}`;
        return axiosInstance(original); // 원래 요청 재시도
      } catch {
        clearAuth();
        // 로그인 페이지로 보내기 (라우터 밖이라 location 사용)
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

/* ==========================================================================
   3. 파일 관련
========================================================================== */

/**
 * 첨부파일(이미지)의 절대 URL을 만듭니다.
 *
 * <img src>는 axios를 거치지 않고 브라우저가 직접 요청하므로 baseURL이 적용되지 않습니다.
 * 그래서 API_BASE를 앞에 붙여 절대경로로 만들어 줍니다.
 *
 * @param purl  AttachType.purl  (예: /attach/storage/BOARD/images)
 * @param sname AttachType.sname (서버 저장 파일명)
 */
export const getAttachUrl = (purl?: string, sname?: string) => {
  if (!purl || !sname) return '';
  return `${API_BASE}${purl}/${sname}`;
};

/** 암장 대표 이미지 URL */
export const getGymImageUrl = (thumb?: string) =>
  thumb ? `${API_BASE}/gym/storage/${thumb}` : '';

/** 상품 이미지 URL */
export const getProductImageUrl = (thumb?: string) =>
  thumb ? `${API_BASE}/product/storage/${thumb}` : '';

/** 회원 프로필 이미지 URL */
export const getProfileImageUrl = (img?: string) =>
  img ? `${API_BASE}/member/storage/${img}` : '';

/**
 * 첨부파일 다운로드.
 * 서버의 /download 엔드포인트를 blob으로 받아 <a download>로 저장시킵니다.
 *
 * @param dir      저장 폴더 (예: BOARD/files)
 * @param filename 서버 저장 파일명 (UUID)
 * @param downname 사용자가 받을 원본 파일명
 */
export const download = async (dir: string, filename: string, downname: string) => {
  try {
    const res = await axiosInstance.get('/download', {
      params: { dir, filename, downname },
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = downname;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url); // 메모리 누수 방지 (필수)
  } catch (err) {
    console.error('다운로드 실패:', err);
    alert('파일 다운로드 중 오류가 발생했습니다.');
  }
};

/** 파일 크기(byte)를 읽기 쉬운 단위로 변환 */
export const formatFileSize = (bytes: number): string => {
  if (!bytes) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

/* ==========================================================================
   4. 날짜 / 숫자 포맷
========================================================================== */

/** 현재 일시를 'yyyy-MM-dd HH:mm:ss'로 반환 (백엔드 CDATE 형식과 동일) */
export const getNowDate = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
       + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** 오늘 날짜 'yyyy-MM-dd' */
export const getToday = (): string => getNowDate().substring(0, 10);

/** 'yyyy-MM-dd HH:mm:ss' → 'yyyy-MM-dd' (목록에서 날짜만 보여줄 때) */
export const toDate = (datetime?: string) => (datetime ? datetime.substring(0, 10) : '');

/** 'yyyy-MM-dd HH:mm:ss' → 'MM-dd HH:mm' (좁은 목록용) */
export const toShortDate = (datetime?: string) =>
  datetime ? datetime.substring(5, 16) : '';

/**
 * 상대 시간 표기 ("3분 전", "2시간 전", "어제", 그 이후는 날짜).
 * 커뮤니티 목록처럼 최신성이 중요한 화면에서 사용합니다.
 */
export const toRelativeTime = (datetime?: string): string => {
  if (!datetime) return '';
  // 'yyyy-MM-dd HH:mm:ss'는 Safari에서 Date 파싱이 실패할 수 있어 'T'로 바꿔줍니다.
  const target = new Date(datetime.replace(' ', 'T')).getTime();
  if (Number.isNaN(target)) return toDate(datetime);

  const diff = Math.floor((Date.now() - target) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 172800) return '어제';
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return toDate(datetime);
};

/** 숫자에 천 단위 콤마 (12000 → "12,000") */
export const comma = (n?: number): string =>
  n === undefined || n === null ? '0' : n.toLocaleString('ko-KR');

/** 가격 표기 (12000 → "12,000원") */
export const won = (n?: number): string => `${comma(n)}원`;

/** 조회수 축약 (1200 → "1.2천", 25000 → "2.5만") */
export const shortCount = (n?: number): string => {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}천`;
  return `${(n / 10000).toFixed(1)}만`;
};

/* ==========================================================================
   5. 난이도 변환 ★ 이 프로젝트의 핵심 로직

   백엔드 Tool.toSortOrder()와 **완전히 같은 규칙**입니다.
   프론트에서도 필요한 이유: 등반일지 입력 화면에서 사용자가 난이도를 고르면
   즉시 "중급" 같은 라벨을 미리보기로 보여주기 위해서입니다.
   (실제 DB에 저장되는 값은 항상 서버가 계산한 값을 신뢰합니다 —
    클라이언트 값을 그대로 믿으면 조작될 수 있으므로)
========================================================================== */

/** 난이도 체계 */
export type GradeSystem = 'V' | 'YDS' | 'FRENCH' | 'COLOR';

/** 색상 난이도 → 정규화 점수 */
export const COLOR_GRADE_ORDER: Record<string, number> = {
  '흰색': 8, '노랑': 16, '주황': 24, '초록': 34, '파랑': 44,
  '빨강': 54, '보라': 64, '회색': 74, '갈색': 84, '검정': 94,
};

/** 색상 난이도 → CSS 클래스 (common.css의 .grade.g_xxx) */
export const COLOR_GRADE_CLASS: Record<string, string> = {
  '흰색': 'g_white', '노랑': 'g_yellow', '주황': 'g_orange', '초록': 'g_green',
  '파랑': 'g_blue', '빨강': 'g_red', '보라': 'g_purple', '회색': 'g_gray',
  '갈색': 'g_brown', '검정': 'g_black',
};

/**
 * 난이도 표기를 0~100 정규화 점수로 변환합니다.
 * (백엔드 dev.jpa.climbon.tool.Tool.toSortOrder 와 동일한 규칙)
 */
export const toSortOrder = (system?: string, code?: string): number => {
  if (!system || !code) return 0;
  const sys = system.trim().toUpperCase();
  const val = code.trim().toUpperCase();

  if (sys === 'V') {
    const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) ? 0 : Math.min(100, 10 + n * 6);
  }

  if (sys === 'YDS') {
    // 5.9 이하: major*2+6 / 5.10 이상: 30 + (major-10)*12, 뒤 letter b=+3, c=+6, d=+9
    let body = val.replace('5.', '');
    let letter = '';
    if (/[A-D]$/.test(body)) {
      letter = body.slice(-1);
      body = body.slice(0, -1);
    }
    const major = parseInt(body, 10);
    if (Number.isNaN(major)) return 0;
    const base = major <= 9 ? major * 2 + 6 : 30 + (major - 10) * 12;
    const plus = letter === 'B' ? 3 : letter === 'C' ? 6 : letter === 'D' ? 9 : 0;
    return Math.min(100, base + plus);
  }

  if (sys === 'FRENCH') {
    const major = parseInt(val.substring(0, 1), 10);
    const rest = val.substring(1);
    const baseMap: Record<number, number> = { 4: 12, 5: 20, 6: 32, 7: 56, 8: 80, 9: 92 };
    const base = baseMap[major] ?? 0;
    let plus = 0;
    if (rest.startsWith('B')) plus += 4;
    else if (rest.startsWith('C')) plus += 8;
    if (rest.endsWith('+')) plus += 2;
    return Math.min(100, base + plus);
  }

  if (sys === 'COLOR') return COLOR_GRADE_ORDER[code.trim()] ?? 0;

  return 0;
};

/** 정규화 점수 → 난이도 구간 라벨 */
export const toLevelLabel = (sortOrder?: number): string => {
  if (!sortOrder || sortOrder <= 0) return '미분류';
  if (sortOrder < 20) return '입문';
  if (sortOrder < 40) return '초급';
  if (sortOrder < 60) return '중급';
  if (sortOrder < 80) return '상급';
  return '고수';
};

/** 정규화 점수 → 레벨 배지 CSS 클래스 (common.css의 .level_tag.lvN) */
export const toLevelClass = (sortOrder?: number): string => {
  if (!sortOrder || sortOrder <= 0) return '';
  if (sortOrder < 20) return 'lv1';
  if (sortOrder < 40) return 'lv2';
  if (sortOrder < 60) return 'lv3';
  if (sortOrder < 80) return 'lv4';
  return 'lv5';
};

/** 난이도 구간 필터 옵션 (검색 화면의 "입문/초급/..." 버튼) */
export const LEVEL_RANGES = [
  { label: '입문', min: 0,  max: 19,  cls: 'lv1' },
  { label: '초급', min: 20, max: 39,  cls: 'lv2' },
  { label: '중급', min: 40, max: 59,  cls: 'lv3' },
  { label: '상급', min: 60, max: 79,  cls: 'lv4' },
  { label: '고수', min: 80, max: 100, cls: 'lv5' },
] as const;

/* ==========================================================================
   6. 기타 헬퍼
========================================================================== */

/** 엔터키를 누르면 지정한 함수를 실행 (검색창에서 주로 사용) */
export const onEnter = (
  e: React.KeyboardEvent<HTMLInputElement>,
  callback: () => void,
) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    callback();
  }
};

/**
 * 페이지 이동 시 스크롤을 맨 위로 올립니다.
 * react-router는 SPA라서 페이지를 바꿔도 스크롤 위치가 그대로 남습니다.
 * App.tsx 최상단에 <ScrollToTop /> 한 번만 넣어두면 모든 이동에 적용됩니다.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** axios 에러에서 서버가 보낸 메시지를 꺼냅니다. 없으면 기본 문구를 반환합니다. */
export const getErrorMessage = (error: unknown, fallback = '처리 중 오류가 발생했습니다.'): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
};

/** HTML 태그를 제거하고 순수 텍스트만 남깁니다 (목록 미리보기용) */
export const stripTags = (html?: string): string =>
  html ? html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';

/** 문자열을 지정 길이로 자르고 말줄임표를 붙입니다 */
export const cut = (text?: string, length = 60): string => {
  if (!text) return '';
  return text.length <= length ? text : `${text.substring(0, length)}...`;
};
