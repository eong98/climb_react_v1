import { useState } from 'react';

/* ============================================================================
   알림/확인 모달 상태 관리 훅

   [왜 window.alert / window.confirm을 안 쓰나]
   1) 브라우저 기본 팝업은 디자인을 바꿀 수 없어 서비스 톤과 따로 논다
   2) confirm은 동기적으로 화면을 멈춰 세워 UX가 끊긴다
   3) 모바일에서 모양이 제각각이다
   그래서 직접 만든 AlertModal / ConfirmModal을 쓰고,
   그 열고 닫는 상태를 이 훅으로 간단히 관리합니다.

   @example
   const { alert, showAlert, closeAlert } = useAlert();
   showAlert('저장되었습니다.', 'success', () => loadList());
   {alert && <AlertModal {...alert} onClose={closeAlert} />}
============================================================================ */

export interface AlertState {
  message: string;
  variant?: 'success' | 'error' | 'info';
  /** 확인 버튼을 눌렀을 때 실행할 동작 (목록 새로고침, 페이지 이동 등) */
  onConfirm?: () => void;
}

export function useAlert() {
  const [alert, setAlert] = useState<AlertState | null>(null);

  const showAlert = (
    message: string,
    variant: AlertState['variant'] = 'info',
    onConfirm?: () => void,
  ) => setAlert({ message, variant, onConfirm });

  const closeAlert = () => setAlert(null);

  return { alert, showAlert, closeAlert };
}
