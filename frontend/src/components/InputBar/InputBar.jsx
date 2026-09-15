import './InputBar.css'
import Button from '../Button/Button'

/**C7 InputBar
 * design.md 4장 컴포넌트 규격
 *
 *   - 좌: 카메라 아이콘 버튼 44×44 1px 테두리 12px 라운드
 *   - 중: 입력 44높이 12px 라운드 placeholder "직접 입력해도 돼요"
 *   - 우: 보내기 44×44 원형 --c-primary 흰 화살표
 *
 *   - 6번 화면(약 찾기 패널): 카메라 없음, placeholder "약 이름을 알면 여기에"
 *   - 9번 화면(응급): 전부 비활성
 *
 * props
 *   value          : 입력값
 *   onChange       : (값) => void
 *   onSend         : (값) => void — 보내기 클릭 or Enter
 *   placeholder    : placeholder 문자열
 *   hasCamera      : 카메라 버튼 표시 여부 (S6에서 false)
 *   disabled       : 비활성 (S9 응급)
 *   pillMode       : pill 모드 (placeholder="약 이름을 알면 여기에")
 *   onCameraClick  : 카메라 버튼 클릭 시 호출 (파일 입력 트리거)
 */
export default function InputBar({
  value = '',
  onChange,
  onSend,
  placeholder = '직접 입력해도 돼요',
  hasCamera = true,
  disabled = false,
  pillMode = false,
  onCameraClick,
}) {
const handleKeyDown = (e) => {
  if (e.nativeEvent.isComposing || e.keyCode === 229) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onSend?.(value)
  }
}

  return (
    <div
      className={[
        'c-inputbar',
        pillMode ? 'c-inputbar--pill-mode' : '',
        disabled ? 'c-inputbar--disabled' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* 카메라 버튼 */}
      {hasCamera ? (
        <div className="c-inputbar__left">
          <button
            type="button"
            className="c-inputbar__camera-btn"
            onClick={() => {
              onCameraClick?.()
            }}
            aria-label="사진 찍기"
            disabled={disabled}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
              <circle cx="12" cy="14" r="3.25" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* 입력창 */}
      <div className="c-inputbar__input-area">
        <textarea
          className={`c-inputbar__input${pillMode ? ' c-inputbar__input--pill' : ''}`}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-label="입력"
        />
      </div>

      {/* 보내기 버튼 */}
      <div className="c-inputbar__right">
        <Button
          kind="primary"
          size="circle"
          disabled={disabled || !value.trim()}
          onClick={() => onSend?.(value)}
          aria-label="보내기"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 7-7 7 7" />
            <path d="M12 5v14" />
          </svg>
        </Button>
      </div>
    </div>
  )
}
