import { useEffect, type ReactNode } from 'react';

/**
 * 범용 모달.
 *
 * - 배경(dim)을 클릭하거나 ESC를 누르면 닫힙니다.
 * - 모달이 열려 있는 동안 body 스크롤을 막습니다.
 *   (안 막으면 모달 위에서 스크롤할 때 뒤 페이지가 같이 움직여 어지럽습니다)
 *
 * @example
 * {open && (
 *   <Modal title="난이도 선택" onClose={() => setOpen(false)}
 *          footer={<button className="btn btn_primary" onClick={save}>저장</button>}>
 *     ...내용...
 *   </Modal>
 * )}
 */
interface Props {
  title?: string;
  children: ReactNode;
  onClose: () => void;
  /** 하단 버튼 영역 */
  footer?: ReactNode;
  /** 넓은 모달 여부 */
  large?: boolean;
}

export default function Modal({ title, children, onClose, footer, large }: Props) {
  useEffect(() => {
    // ESC 키로 닫기
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // 배경 스크롤 잠금
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 정리(cleanup): 모달이 사라질 때 원래대로 되돌립니다.
    // 이걸 빼먹으면 모달을 닫아도 페이지 스크롤이 막힌 채로 남습니다.
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="modal_dim" onClick={onClose} role="presentation">
      {/*
        stopPropagation: 모달 안쪽을 클릭했을 때 이벤트가 부모(dim)까지 올라가
        모달이 닫히는 것을 막습니다. (이벤트 버블링 차단)
      */}
      <div
        className={`modal ${large ? 'lg' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="modal_head">
            <h4>{title}</h4>
            <button type="button" className="btn_close" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          </div>
        )}

        <div className="modal_body">{children}</div>

        {footer && <div className="modal_foot">{footer}</div>}
      </div>
    </div>
  );
}
