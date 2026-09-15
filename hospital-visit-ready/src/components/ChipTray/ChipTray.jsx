import './ChipTray.css'

/**
 * C6 ChipTray
 * design.md 4장 컴포넌트 규격
 *
 *   - flex-wrap, 8px 간격, 좌측부터
 *   - 칩: 높이 36, 패딩 0 14, 999px 라운드, 1px --c-primary,
 *          글자 --c-primary 14/500, 배경 --c-surface
 *   - 누르면 배경 --c-primary-tint
 *   - 마지막 칩은 항상 탈출구
 *   - 선택 후 트레이는 사라진다 (외부에서 제어)
 *   - 선택 칩은 배경 + 체크 아이콘으로 구분 (색만으로 구분 금지)
 *
 * 접근성 (체크리스트 9번):
 *   - 칩은 <button>, 트레이는 role="group" aria-label="답 고르기"
 *   - 칩 높이 36 + 상하 4px 마진 → 44px 터치 영역 확보
 *
 * props
 *   chips       : { id, label, isEscape? }[]
 *   onSelect    : (chip) => void
 *   selectedId  : 현재 선택된 칩 id (없으면 undefined)
 *   onEscape    : 탈출구 칩 클릭 시 별도 처리 (선택)
 */
export default function ChipTray({ chips = [], onSelect, selectedId, onEscape }) {
  const handleSelect = (chip, e) => {
    e.stopPropagation()
    onSelect?.(chip, e)
  }

  return (
    <ul className="chip-tray" role="group" aria-label="답 고르기">
      {chips.map((chip, index) => {
        const isLast = index === chips.length - 1
        const isSelected = selectedId === chip.id

        return (
          <li key={chip.id} style={{ margin: '4px 0' }}>
            <button
              type="button"
              className="chip"
              aria-pressed={isSelected}
              onClick={(e) => handleSelect(chip, e)}
            >
              {isSelected && (
                <span className="chip-check" aria-hidden="true">
                  ✓
                </span>
              )}
              {chip.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
