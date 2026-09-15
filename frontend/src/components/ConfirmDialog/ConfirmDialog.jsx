import './ConfirmDialog.css'

/**
 * ConfirmDialog
 * 확인 시트 — "기록 전부 지우기", "+ 새 진료 준비" 확인용
 *
 * design.md:
 *   - drawer.clear.confirm: "이 브라우저의 프로필, 사진, 메모를 전부 지워요. 되돌릴 수 없어요."
 *   - 드로어 닫기 확인: "지금 것 버리고 새로 시작할까요?"
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel = '취소',
  variant = 'danger', // 'danger' | 'secondary'
}) {
  if (!open) return null

  return (
    <div className="confirm-overlay" onClick={onClose} role="presentation">
      <div
        className="confirm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-content">
          <h2 id="confirm-title" className="confirm-title">{title}</h2>
          <p className="confirm-body">{body}</p>
          <div className="confirm-actions">
            <button
              type="button"
              className={`confirm-btn confirm-btn--${variant === 'danger' ? 'cancel' : 'secondary'}`}
              onClick={onClose}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`confirm-btn confirm-btn--${variant === 'danger' ? 'danger' : 'primary'}`}
              onClick={(e) => {
                e.stopPropagation()
                onConfirm()
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
