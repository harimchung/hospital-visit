import { useState, useRef, useEffect } from 'react'
import './App.css'

const bodyParts = [
  { id: 'head', label: '머리' },
  { id: 'face-neck', label: '얼굴·목' },
  { id: 'chest-back', label: '가슴·등' },
  { id: 'abdomen', label: '배' },
  { id: 'arm-leg', label: '팔·다리' },
  { id: 'hand-foot', label: '손·발' },
  { id: 'other', label: '그 외' },
]

function App() {
  const [messages, setMessages] = useState([
    { id: 'sys-1', role: 'system', text: '어디가 아픈가요?' }
  ])
  const [input, setInput] = useState('')
  const [selectedPart, setSelectedPart] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const chatEndRef = useRef(null)
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendText = () => {
    const text = input.trim()
    if (!text) return
    if (selectedPart === null) {
      setMessages(m => [
        ...m,
        { id: `user-${Date.now()}`, role: 'user', text },
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          text: '말씀해 주신 내용을 잘 받아뒀어요. 아래 버튼으로 부위를 한 번 더 골라 주실 수도 있어요.'
        }
      ])
      return
    }
    setMessages(m => [...m, { id: `user-${Date.now()}`, role: 'user', text }])
    setInput('')
  }

  const selectPart = (id, label) => {
    setSelectedPart(id)
    setMessages(m => [
      ...m,
      { id: `sys-${Date.now()}`, role: 'system', text: `${label}이(가) 아프시군요. 어떻게 아픈지 말씀해 주세요.` }
    ])
  }

  const handleLogin = () => {
    setToast('로그인 기능은 곧 추가됩니다.')
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="sidebar-toggle" type="button" onClick={() => setSidebarOpen((v) => !v)} aria-label="사이드바 토글">
          <span className="hamburger" />
        </button>
        <div className="brand">
          <img src="/visitready-mark-bubble.svg" alt="VisitReady" className="brand-logo" />
        </div>
        <button className="login-btn" type="button" onClick={handleLogin}>로그인하기</button>
      </header>

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-hidden={!sidebarOpen}>
        <div className="sidebar-inner">
          <div className="sidebar-empty">
            <p>진행 단계가 들어갈 곳이에요.</p>
            <p className="muted">아직 시작하지 않았어요.</p>
          </div>
        </div>
      </aside>

      <main className="chat-area">
        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`message message-${m.role}`}>
              <div className="bubble">{m.text}</div>
            </div>
          ))}

          {messages.length === 1 && selectedPart === null && (
            <div className="answer-section">
              <p className="answer-prompt">버튼으로 고르거나, 글로 답할 수도 있어요.</p>
              <div className="part-grid">
                {bodyParts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`part-btn ${selectedPart === p.id ? 'selected' : ''}`}
                    onClick={() => selectPart(p.id, p.label)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="input-area">
          <textarea
            className="chat-input"
            placeholder="글로 답할 수도 있어요"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendText()
              }
            }}
          />
          <div className="attach-row">
            <label className="attach-btn">
              <span className="attach-icon" aria-hidden="true" />
              사진
              <input type="file" accept="image/*" className="attach-input" />
            </label>
            <button type="button" className="send-btn" onClick={sendText}>보내기</button>
          </div>
        </div>
      </main>

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}

export default App
