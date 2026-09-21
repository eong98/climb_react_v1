import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AlertModal, PageHeader } from '../../components/ui';
import MyPageNav from './MyPageNav';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession } from '../../store/LoginStore';
import { axiosInstance, getErrorMessage } from '../../utils/Tool';

/* ============================================================================
   비밀번호 변경 — /mypage/password

   PUT /member/password  body: { currentPassword, newPassword }

   [검증을 프론트에서도 하는 이유]
   서버도 같은 규칙을 검사합니다. 그래도 프론트에서 먼저 거르는 이유는
   "네트워크 왕복 없이 즉시 피드백"을 주기 위해서입니다.
   8자 미만인 걸 서버에 물어보고 300ms 뒤에 알게 되는 것보다,
   입력하는 순간 빨간 글씨로 알려주는 쪽이 훨씬 낫습니다.

   [면접 포인트] 단, 프론트 검증은 UX용이지 보안 수단이 아닙니다.
   개발자도구로 우회 가능하므로 최종 판단은 항상 서버가 합니다.
============================================================================ */

/** 비밀번호 규칙: 8자 이상 + 영문/숫자 조합 */
const MIN_LENGTH = 8;
const hasLetter = (value: string) => /[A-Za-z]/.test(value);
const hasDigit = (value: string) => /[0-9]/.test(value);

/** 규칙을 모두 만족하는지 */
const isValidPassword = (value: string) =>
  value.length >= MIN_LENGTH && hasLetter(value) && hasDigit(value);

export default function PasswordChange() {
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();
  const clearAuth = GlobalStoreSession((state) => state.clearAuth);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  /* ------------------------------------------------------------------
     실시간 안내 문구

     입력을 시작하기 전(빈 문자열)에는 아무 경고도 띄우지 않습니다.
     화면에 들어오자마자 빨간 글씨가 보이면 "내가 뭘 잘못했나" 싶어 불안합니다.
  ------------------------------------------------------------------ */

  /** 새 비밀번호 규칙 검사 결과 */
  const newPasswordHint = (() => {
    if (!newPassword) return null;
    if (newPassword.length < MIN_LENGTH) {
      return { ok: false, text: `${MIN_LENGTH}자 이상 입력해주세요. (현재 ${newPassword.length}자)` };
    }
    if (!hasLetter(newPassword) || !hasDigit(newPassword)) {
      return { ok: false, text: '영문과 숫자를 모두 포함해야 합니다.' };
    }
    if (currentPassword && newPassword === currentPassword) {
      return { ok: false, text: '현재 비밀번호와 다른 값을 사용해주세요.' };
    }
    return { ok: true, text: '사용 가능한 비밀번호입니다.' };
  })();

  /** 확인란 일치 여부 */
  const confirmHint = (() => {
    if (!confirmPassword) return null;
    return newPassword === confirmPassword
      ? { ok: true, text: '비밀번호가 일치합니다.' }
      : { ok: false, text: '비밀번호가 일치하지 않습니다.' };
  })();

  /** 제출 가능 여부 — 버튼 비활성화로 잘못된 요청 자체를 줄입니다. */
  const canSubmit =
    !!currentPassword &&
    isValidPassword(newPassword) &&
    newPassword !== currentPassword &&
    newPassword === confirmPassword;

  /* ==================================================================
     변경 요청
  ================================================================== */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    /* 버튼을 막아뒀더라도 엔터 제출 등으로 들어올 수 있으니 한 번 더 확인합니다. */
    if (!currentPassword) {
      showAlert('현재 비밀번호를 입력해주세요.', 'error');
      return;
    }
    if (!isValidPassword(newPassword)) {
      showAlert(`새 비밀번호는 ${MIN_LENGTH}자 이상이며 영문과 숫자를 포함해야 합니다.`, 'error');
      return;
    }
    if (newPassword === currentPassword) {
      /*
        [왜 같은 비밀번호를 막나]
        비밀번호 변경은 보통 "유출이 의심된다 / 오래 썼다"는 이유로 합니다.
        같은 값으로 바꾸면 변경한 의미가 전혀 없으므로 규칙으로 막습니다.
      */
      showAlert('현재 비밀번호와 같은 값으로는 변경할 수 없습니다.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('새 비밀번호와 확인 값이 일치하지 않습니다.', 'error');
      return;
    }

    setSaving(true);
    try {
      /* CONVENTIONS.md 3장: PUT /member/password body {currentPassword, newPassword} */
      await axiosInstance.put('/member/password', { currentPassword, newPassword });

      /*
        [면접 포인트] 비밀번호를 바꾸면 왜 다시 로그인시키나

        1) 이미 발급된 토큰은 비밀번호와 무관하게 만료 전까지 유효합니다.
           "비밀번호가 유출된 것 같아 바꿨는데, 유출된 기기의 세션은 그대로 살아 있다"면
           변경의 목적이 절반은 무의미해집니다. 로그아웃시켜 모든 세션을 정리하는 것이
           사용자 기대에 맞습니다.
        2) 새 비밀번호로 실제 로그인이 되는지 즉시 확인하게 하는 효과도 있습니다.
           (비밀번호 관리자에 새 값이 제대로 저장됐는지 그 자리에서 검증됩니다)

        [실무 팁] 서비스에 따라서는 서버가 리프레시 토큰을 무효화(블랙리스트)하고
        다른 기기까지 강제 로그아웃시킵니다. 여기서는 클라이언트 세션만 정리합니다.
      */
      showAlert(
        '비밀번호가 변경되었습니다.\n보안을 위해 다시 로그인해주세요.',
        'success',
        () => {
          clearAuth();
          navigate('/login', { replace: true });
        },
      );
    } catch (err) {
      showAlert(getErrorMessage(err, '비밀번호 변경에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container section my_page">
      <PageHeader title="비밀번호 변경" desc="주기적으로 비밀번호를 변경하면 계정을 더 안전하게 지킬 수 있습니다." />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          <form className="card form_page my_pw_form" onSubmit={handleSubmit}>
            {/* ---------- 현재 비밀번호 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pw_current">
                현재 비밀번호<span className="req">*</span>
              </label>
              <div className="form_control">
                <input
                  id="pw_current"
                  type="password"
                  className="form_input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  /* 브라우저 비밀번호 관리자가 올바르게 동작하도록 autoComplete를 지정합니다. */
                  autoComplete="current-password"
                  maxLength={50}
                  placeholder="현재 사용 중인 비밀번호"
                />
              </div>
            </div>

            {/* ---------- 새 비밀번호 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pw_new">
                새 비밀번호<span className="req">*</span>
              </label>
              <div className="form_control">
                <input
                  id="pw_new"
                  type="password"
                  className={`form_input ${newPasswordHint && !newPasswordHint.ok ? 'is_error' : ''}`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={50}
                  placeholder="8자 이상, 영문 + 숫자 조합"
                />
                {newPasswordHint ? (
                  <p className={`form_hint ${newPasswordHint.ok ? 'ok' : 'error'}`}>
                    {newPasswordHint.text}
                  </p>
                ) : (
                  <p className="form_hint">8자 이상이면서 영문과 숫자를 모두 포함해야 합니다.</p>
                )}

                {/* 규칙 체크리스트 — "왜 안 되는지"를 한눈에 보여줍니다. */}
                <ul className="my_pw_rules">
                  <li className={newPassword.length >= MIN_LENGTH ? 'ok' : ''}>
                    {newPassword.length >= MIN_LENGTH ? '✓' : '·'} {MIN_LENGTH}자 이상
                  </li>
                  <li className={hasLetter(newPassword) ? 'ok' : ''}>
                    {hasLetter(newPassword) ? '✓' : '·'} 영문 포함
                  </li>
                  <li className={hasDigit(newPassword) ? 'ok' : ''}>
                    {hasDigit(newPassword) ? '✓' : '·'} 숫자 포함
                  </li>
                </ul>
              </div>
            </div>

            {/* ---------- 새 비밀번호 확인 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pw_confirm">
                새 비밀번호 확인<span className="req">*</span>
              </label>
              <div className="form_control">
                <input
                  id="pw_confirm"
                  type="password"
                  className={`form_input ${confirmHint && !confirmHint.ok ? 'is_error' : ''}`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={50}
                  placeholder="새 비밀번호를 한 번 더 입력"
                />
                {confirmHint && (
                  <p className={`form_hint ${confirmHint.ok ? 'ok' : 'error'}`}>
                    {confirmHint.text}
                  </p>
                )}
              </div>
            </div>

            <div className="notice_box warn mt16">
              🔒 비밀번호를 변경하면 보안을 위해 자동으로 로그아웃되며, 새 비밀번호로 다시
              로그인해야 합니다.
            </div>

            <div className="form_page_footer">
              <button
                type="button"
                className="btn btn_ghost"
                onClick={() => navigate('/mypage')}
                disabled={saving}
              >
                취소
              </button>
              <button type="submit" className="btn btn_primary" disabled={!canSubmit || saving}>
                {saving ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
