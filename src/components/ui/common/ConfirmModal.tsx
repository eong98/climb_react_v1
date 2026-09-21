import Modal from './Modal';

/**
 * 확인/취소 모달 (window.confirm 대체).
 *
 * 삭제처럼 되돌릴 수 없는 동작 앞에 반드시 한 번 물어봅니다.
 *
 * @example
 * {target && (
 *   <ConfirmModal
 *     message="이 게시글을 삭제할까요? 삭제하면 되돌릴 수 없습니다."
 *     confirmText="삭제"
 *     danger
 *     loading={deleting}
 *     onConfirm={handleDelete}
 *     onClose={() => setTarget(null)}
 *   />
 * )}
 */
interface Props {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 위험한 동작(삭제 등)이면 확인 버튼을 빨간색으로 */
  danger?: boolean;
  /** 처리 중이면 버튼 비활성화 (중복 클릭으로 두 번 삭제되는 것 방지) */
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  title = '확인',
  message,
  confirmText = '확인',
  cancelText = '취소',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal title={title} onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn_ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn_danger' : 'btn_primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '처리 중...' : confirmText}
          </button>
        </>
      }
    >
      <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
    </Modal>
  );
}
