import './AgentBubble.css'

/**
 * C2 AgentBubble
 * design.md 4장 컴포넌트 규격
 *
 *   - 좌측 정렬, 최대 폭 80%
 *   - 배경 --c-surface, 1px --c-border, 12px 라운드, 패딩 12/14
 *   - 글자 15 (--fs-body)
 *   - 아래 Hint(C3)가 붙을 수 있다
 *
 * children: 말풍선 내용 (문자열, 또는 React 노드)
 * hint    : Hint 텍스트 (없으면 렌더하지 않음)
 */
export default function AgentBubble({ children, hint }) {
  return (
    <div className="agent-bubble" aria-live="polite">
      {children}
      {hint != null && hint !== '' && <Hint text={hint} />}
    </div>
  )
}

function Hint({ text }) {
  return (
    <p className="hint">
      {text}
    </p>
  )
}
