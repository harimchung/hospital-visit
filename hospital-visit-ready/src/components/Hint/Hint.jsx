import './Hint.css'

/**
 * C3 Hint
 * design.md 4장 컴포넌트 규격
 *
 *   - AgentBubble 바로 아래 4px 간격
 *   - 좌측 4px 들여쓰기
 *   - 12px --c-text-2. 한 줄.
 */
export default function Hint({ text }) {
  if (!text) return null

  return (
    <p className="hint">
      {text}
    </p>
  )
}
