import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { LoginResponse } from '../../components/ts/Member';
import { GlobalStoreSession } from '../../store/LoginStore';
import { axiosInstance, getErrorMessage } from '../../utils/Tool';

/* ============================================================================
   로그인 페이지

   [흐름]
   1) 아이디/비밀번호 입력 → POST /member/login
   2) 성공: 토큰 + 회원정보를 전역 스토어(zustand)에 저장
   3) RequireAuth가 넘겨준 location.state.from 이 있으면 그 주소로,
      없으면 메인(/)으로 이동
============================================================================ */

/** RequireAuth가 <Navigate state={{ from }} />로 넘겨주는 값의 형태 */
interface LocationState {
  from?: string;
}

/** 포트폴리오 시연용 테스트 계정 (실제 서비스라면 절대 노출하지 않습니다) */
const DEMO_ACCOUNTS = [
  { role: '관리자', id: 'admin', password: 'password' },
  { role: '회원', id: 'climber01', password: 'password' },
] as const;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  /** 스토어 전체를 구독하면 닉네임만 바뀌어도 이 화면이 다시 그려집니다.
      필요한 함수 하나만 선택(selector)해서 가져옵니다. */
  const setLogin = GlobalStoreSession((state) => state.setLogin);

  const [form, setForm] = useState({ id: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /** 로그인 후 돌아갈 주소. 비로그인 상태로 /mypage에 접근했다면 '/mypage'가 들어 있습니다. */
  const from = (location.state as LocationState | null)?.from;

  /** 입력값 변경 — name 속성을 키로 써서 핸들러 하나로 모든 입력을 처리합니다 */
  const handleChange = (name: 'id' | 'password', value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    // 다시 입력하기 시작하면 이전 오류 메시지는 지워 줍니다 (계속 떠 있으면 혼란스럽습니다)
    if (error) setError('');
  };

  /**
   * 로그인 요청.
   *
   * <form onSubmit>으로 묶었기 때문에 엔터키만 눌러도 이 함수가 실행됩니다.
   * (input마다 onKeyDown을 붙이는 것보다 간단하고, 브라우저 기본 동작과도 일치합니다)
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // 폼 기본 동작(페이지 새로고침) 차단 — SPA에서는 필수

    const id = form.id.trim();
    const password = form.password;

    // 서버를 왕복하기 전에 걸러낼 수 있는 것은 먼저 거릅니다 (불필요한 요청 방지)
    if (!id || !password) {
      setError('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await axiosInstance.post<LoginResponse>('/member/login', { id, password });
      const { accessToken, refreshToken, member } = res.data;

      // 전역 스토어에 저장 → 헤더/마이페이지/글쓰기 등 모든 화면이 즉시 로그인 상태로 바뀝니다.
      setLogin({
        no: member.no ?? 0,
        id: member.id,
        nickname: member.nickname,
        grade: member.grade ?? 6,
        profileImg: member.profileImg,
        accessToken,
        refreshToken,
      });

      /* replace: true 로 이동하는 이유
         일반 navigate면 히스토리에 /login이 남아, 로그인 후 뒤로가기를 누르면
         다시 로그인 화면이 나옵니다. replace는 그 기록을 덮어써서
         뒤로가기가 로그인 이전 화면으로 자연스럽게 이어집니다. */
      navigate(from || '/', { replace: true });
    } catch (err) {
      /* 실패는 모달이 아니라 폼 안에 인라인으로 표시합니다.
         모달은 확인을 눌러야 사라져서, 비밀번호를 고쳐 다시 시도하려는
         사용자에게 한 단계를 더 요구하게 됩니다. */
      setError(getErrorMessage(err, '아이디 또는 비밀번호가 일치하지 않습니다.'));
    } finally {
      // 성공/실패 어느 쪽이든 버튼은 다시 눌릴 수 있어야 하므로 finally에서 풉니다.
      setLoading(false);
    }
  };

  /** 테스트 계정을 입력창에 바로 채워 줍니다 (시연할 때 타이핑 줄이기) */
  const fillDemo = (id: string, password: string) => {
    setForm({ id, password });
    setError('');
  };

  return (
    <div className="auth_wrap">
      <div className="auth_card">
        <div className="auth_head">
          <h2>로그인</h2>
          <p>등반 기록과 찜한 암장을 이어서 보려면 로그인하세요</p>
        </div>

        {/* 오류 메시지 — 입력 폼 바로 위 */}
        {error && (
          <p className="auth_error form_hint error" role="alert">
            <span>⚠️</span>
            <span>{error}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form_group">
            <label className="form_label" htmlFor="login_id">아이디</label>
            <input
              id="login_id"
              type="text"
              className="form_input"
              value={form.id}
              placeholder="아이디를 입력하세요"
              autoComplete="username"
              autoFocus
              onChange={(e) => handleChange('id', e.target.value)}
            />
          </div>

          <div className="form_group">
            <label className="form_label" htmlFor="login_pw">비밀번호</label>
            <input
              id="login_pw"
              type="password"
              className="form_input"
              value={form.password}
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
              onChange={(e) => handleChange('password', e.target.value)}
            />
          </div>

          {/* 요청 중에는 버튼을 잠가 같은 요청이 여러 번 나가는 것을 막습니다 */}
          <button type="submit" className="btn btn_primary btn_lg btn_block mt8" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        {/* 시연용 테스트 계정 안내 */}
        <div className="notice_box tip auth_demo">
          <p className="t-sm t-bold">🧪 포트폴리오 시연용 테스트 계정</p>
          {DEMO_ACCOUNTS.map((acc) => (
            <div key={acc.id} className="demo_row">
              <span className="role">{acc.role}</span>
              <span>{acc.id} / {acc.password}</span>
              <button
                type="button"
                className="btn btn_xs btn_outline"
                onClick={() => fillDemo(acc.id, acc.password)}
              >
                입력
              </button>
            </div>
          ))}
          <p className="t-xs t-faint">
            실제 서비스가 아니라 채용 담당자가 가입 없이 바로 둘러볼 수 있도록 열어 둔 계정입니다.
            관리자 계정으로 로그인하면 암장·회원·주문 관리 화면까지 확인할 수 있습니다.
          </p>
        </div>

        <p className="auth_foot">
          아직 회원이 아니신가요?
          <Link to="/join">회원가입</Link>
        </p>
      </div>
    </div>
  );
}
