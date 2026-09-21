import Modal from './Modal';

/**
 * 알림 모달 (window.alert 대체).
 *
 * @example
 * const { alert, showAlert, closeAlert } = useAlert();
 * showAlert('저장되었습니다.', 'success', () => navigate('/community'));
 * {alert && <AlertModal {...alert} onClose={closeAlert} />}
 */
interface Props {
  message: string;
  variant?: 'success' | 'error' | 'info';
  /** 확인 버튼을 눌렀을 때 추가로 실행할 동작 */
  onConfirm?: () => void;
  onClose: () => void;
}

const ICONS = { success: '✅', error: '⚠️', info: 'ℹ️' };
const TITLES = { success: '완료', error: '오류', info: '알림' };

export default function AlertModal({ message, variant = 'info', onConfirm, onClose }: Props) {
  /** 확인 버튼: 모달을 먼저 닫고 콜백을 실행합니다. */
  const handleConfirm = () => {
    onClose();
    onConfirm?.();
  };

  return (
    <Modal title={TITLES[variant]} onClose={handleConfirm}
      footer={
        <button type="button" className="btn btn_primary" onClick={handleConfirm} autoFocus>
          확인
        </button>
      }
    >
      <div className="flex center g12">
        <span style={{ fontSize: 22 }}>{ICONS[variant]}</span>
        {/* white-space: pre-line → 메시지에 \n이 있으면 줄바꿈으로 표시 */}
        <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
      </div>
    </Modal>
  );
}
