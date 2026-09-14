import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import './tokens.css'
import {
  AppBar,
  AgentBubble,
  Hint,
  UserBubble,
  PhotoBubble,
  ChipTray,
  InputBar,
  Card,
  Drawer,
  ConfirmDialog,
  Button,
} from './components'

const STEPS = {
  WHERE: 'where',
  PHOTO: 'photo',
  HOW: 'how',
  WORSE: 'worse',
  SINCE: 'since',
  SINCE_RETRY: 'since-retry',
  MEDS: 'meds',
  TRIED: 'tried',
  TRIED_VISIT: 'tried-visit',
  QUESTIONS: 'questions',
  RESULT: 'result',
}

// 텍스트는 컴포넌트 바깥에서 관리 — 렌더링 중 이펙트 의존성 꼬임을 피한다
const I18N = {
  'app.title': '병원 가기 전',
  'input.placeholder': '직접 입력해도 돼요',
  'input.placeholder.pill': '약 이름을 알면 여기에',
  'where.hint': '칩을 고르거나, 직접 말해도 돼요',
  'emergency.title': '지금 119',
  'emergency.body': '{signal}이 {cond} 계속되는 건 바로 병원에 가야 하는 신호예요. 대본은 만들지 않아요.',
  'emergency.cta': '119 전화하기',
  'drawer.title': '진료 기록',
  'drawer.caption': '이 브라우저에만 저장, 암호화',
  'drawer.new': '+ 새 진료 준비',
  'drawer.clear': '기록 전부 지우기',
  'drawer.clear.confirm': '이 브라우저의 프로필, 사진, 메모를 전부 지워요. 되돌릴 수 없어요.',
  'questions.hint': '질문은 사용자가 쓰지 않아요. 답한 걸로 먼저 만들어 보여 줘요',
  'result.dept.note': '규칙표로 고른 거예요. 진단이 아니에요.',
  'result.note.placeholder': '의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요',
  'photo.ask': '사진 찍어 둘래요? 밤이랑 아침이 다르게 보일 때 나란히 비교할 수 있어요.',
  'photo.saved': '저장했어요. 이 브라우저에만 남고 서버로는 안 가요.',
}
function t(key, vars = {}) {
  let text = I18N[key] || key
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(`{${k}}`, v)
  }
  return text
}

/** 메시지 한 건 */
function makeMessage(type, payload) {
  return { id: crypto.randomUUID(), type, ...payload }
}

function App() {
  const [visit, setVisit] = useState({
    id: crypto.randomUUID(),
    part: null,
    photos: [],
    result: null,
    emergency: null,
  })

  // 메시지 누적 배열 — 앱 화면의 실제 대화 기록
  const [messages, setMessages] = useState([])
  const [step, setStep] = useState(STEPS.WHERE)
  const [chipTrayVisible, setChipTrayVisible] = useState(true)
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(null)

  const messagesRef = useRef(null)
  const fileInputRef = useRef(null)
  const chatEndRef = useRef(null)

  // 메시지가 쌓일 때마다 말풍선 맨 아래로 스크롤
  useEffect(() => {
    messagesRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // S1 where 칩 세트 (design.md 참고)
  const whereChips = [
    { id: 'head', label: '머리' },
    { id: 'face_neck', label: '눈·귀·코·목' },
    { id: 'chest', label: '가슴' },
    { id: 'abdomen', label: '배' },
    { id: 'back_joint', label: '허리·관절' },
    { id: 'skin', label: '피부' },
    { id: 'other', label: '그 외' },
    { id: 'multiple', label: '여러 군데', isEscape: true },
  ]

  const showChips =
    step === STEPS.WHERE &&
    chipTrayVisible &&
    !visit.emergency

  // 에이전트 말풍선을 기록에 추가
  const addAgent = useCallback((body, hint) => {
    setMessages((prev) => [...prev, makeMessage('agent', { body, hint })])
  }, [])

  // 칩 선택 처리
  const handleChipSelect = useCallback(
    (chip) => {
      if (!chip || !!visit.emergency) return

      // 칩 자체도 사용자 발언으로 기록에 남긴다 (대화 유지)
      setMessages((prev) => [
        ...prev,
        makeMessage('user', { text: chip.label }),
      ])

      if (chip.id === 'multiple') {
        setChipTrayVisible(false)
        setStep(STEPS.PHOTO)
        addAgent(<p>어디부터요? 하나씩 골라요</p>)
        return
      }

      setVisit((v) => ({ ...v, part: chip.id }))
      setChipTrayVisible(false)
      setStep(STEPS.PHOTO)
      addAgent(<p>{t('photo.ask')}</p>)
    },
    [visit.emergency, addAgent],
  )

  // 자유입력 처리 (부위 키워드 매칭)
  const handleSendText = useCallback(() => {
    const text = input.trim()
    if (!text || !!visit.emergency) return

    // 입력값은 전송 시점에만 사용자 말풍선으로 기록 (타이핑 중에는 띄우지 않음)
    setMessages((prev) => [...prev, makeMessage('user', { text })])

    if (step === STEPS.WHERE) {
      const matched = matchBodyPart(text)
      if (matched) {
        setVisit((v) => ({ ...v, part: matched }))
        setChipTrayVisible(false)
        setStep(STEPS.PHOTO)
        addAgent(<p>{t('photo.ask')}</p>)
        setInput('')
        return
      }
      // 매칭 실패 → 한 번 되묻기
      setInput('')
      addAgent(
        <p>어디 근처예요?</p>,
        t('where.hint'),
      )
      return
    }

    setInput('')
  }, [step, visit.emergency, input, addAgent])

  function matchBodyPart(text) {
    const map = [
      [/머리|두통|머리가|머리쪽|이마/, 'head'],
      [/눈|시력|눈이|시야가|시린|눈쪽/, 'face_neck'],
      [/귀|코|목|인후|편도|목이|코쪽|귀쪽|목쪽/, 'face_neck'],
      [/가슴|흉통|흉부|명치|심장|가슴쪽|가슴이/, 'chest'],
      [/배|복부|아랫배|윗배|배쪽|속이/, 'abdomen'],
      [/허리|관절|무릎|어깨|손목|발목|허리쪽|관절쪽|팔|다리|허리/, 'back_joint'],
      [/피부|살|살쪽|몸|피부쪽|두드러기|발진/, 'skin'],
      [/여러 군데|여러곳|여기저기|전신/, 'other'],
    ]
    for (const [pattern, id] of map) {
      if (pattern.test(text)) return id
    }
    return 'other'
  }

  // 사진 선택 (InputBar 연동용)
  const handlePhotoSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const label = new Date().getHours() >= 18 ? '밤' : '아침'
    const photo = {
      id: crypto.randomUUID(),
      blob: file,
      takenAt: new Date(),
      label,
    }
    const src = URL.createObjectURL(file)

    setVisit((v) => ({
      ...v,
      photos: [...v.photos, photo],
    }))
    // 사용자 사진 말풍선을 기록에 추가
    setMessages((prev) => [
      ...prev,
      makeMessage('user', { text: label, photo: { src, caption: label } }),
    ])
    // 저장 안내 에이전트 말풍선 추가
    addAgent(<p>{t('photo.saved')}</p>)

    e.target.value = ''
  }, [addAgent])

  const triggerPhotoInput = () => {
    fileInputRef.current?.click()
  }

  // 드로어/확인 처리
  const handleNewStart = () => {
    setConfirmVisible(null)
    setVisit({
      id: crypto.randomUUID(),
      part: null,
      photos: [],
      result: null,
      emergency: null,
    })
    setMessages([])
    setStep(STEPS.WHERE)
    setChipTrayVisible(true)
    setInput('')
    setSidebarOpen(false)
  }

  const handleClearAll = () => {
    setConfirmVisible(null)
    setVisit({
      id: crypto.randomUUID(),
      part: null,
      photos: [],
      result: null,
      emergency: null,
    })
    setMessages([])
    setStep(STEPS.WHERE)
    setChipTrayVisible(true)
  }

  // 응급 판정 (design.md S9 키워드 표 참고)
  const emergencySignals = [
    { id: 'consciousness', label: '의식 저하' },
    { id: 'one_side_paralysis', label: '한쪽 마비' },
    { id: 'chest_pain', label: '흉통 20분 이상' },
    { id: 'breathing', label: '호흡곤란' },
    { id: 'bleeding', label: '지혈 안 됨' },
    { id: 'acute_headache', label: '급성 두통' },
    { id: 'seizure', label: '경련' },
    { id: 'vomiting_blood', label: '토혈' },
    { id: 'rigid_abdomen', label: '딱딱한 복통' },
    { id: 'fever_stiff_neck', label: '고열+목 뻣뻣함' },
  ]

  function detectEmergency(text) {
    if (!text) return null
    const lower = text.toLowerCase().replace(/[\.\?\!\,\s]/g, ' ')

    if (/\b(의식이|의식 저하|의식 없|정신 없|헛소리|횡설수설)\b/i.test(text)) {
      return { signal: '의식 저하', cond: '의식 저하가' }
    }
    if (/\b(한쪽|반신|팔다리 힘|마비|감각 없|한쪽만)\b/i.test(text)) {
      return { signal: '한쪽 마비', cond: '한쪽 마비 증상이' }
    }
    if (/\b(숨|호흡|숨쉬|호흡곤란|숨이|숨 못)\b/i.test(text)) {
      return { signal: '호흡곤란', cond: '숨쉬기 어려운 증상이' }
    }
    if (/\b(지혈|피 안 멎|피가 안|계속 나|상처)\b/i.test(text)) {
      return { signal: '지혈 안 됨', cond: '출혈이 멈추지 않는 상태가' }
    }
    if (/\b(경련|발작|몸이 굳|떨림|의식 잃)\b/i.test(text)) {
      return { signal: '경련', cond: '경련이나 발작 증상이' }
    }
    if (/\b(토혈|피를 토|커피색 토|검붉은 토|위장 출혈|토에서 피)\b/i.test(text)) {
      return { signal: '토혈', cond: '피를 토하는 증상이' }
    }
    return null
  }

  const isEmergency = !!visit.emergency
  const isResult = step === STEPS.RESULT

  return (
    <div className="app-shell">
      {/* ===== C1 AppBar ===== */}
      <AppBar
        onHamburger={() => setSidebarOpen(true)}
        onProfile={() => setSidebarOpen(true)}
        rightLabel={sidebarOpen ? '닫기' : '프로필'}
        mode={sidebarOpen ? 'search' : 'default'}
      />

      {/* ===== 메시지 영역 ===== */}
      <div className="messages" ref={messagesRef}>
        {/* 진행 상태 표시 (원칙 9) */}
        {false && (
          <div className="progress-indicator" role="status" aria-live="polite">
            <span className="progress-dot" aria-hidden="true" />
            {t('questions.hint')}
          </div>
        )}

        {/* S9 응급 카드 */}
        {isEmergency && visit.emergency && (
          <Card variant="danger">
            <div className="c-card__danger-title" style={{ margin: 0 }}>
              {t('emergency.title')}
            </div>
            <p className="c-card__body">
              {t('emergency.body', {
                signal: visit.emergency.signal,
                cond: visit.emergency.cond,
              })}
            </p>
            <a
              href="tel:119"
              className="emergency-cta"
              onClick={(e) => e.preventDefault()}
            >
              {t('emergency.cta')}
            </a>
            <p className="c-card__hint" style={{ marginTop: '12px' }}>
              응급 신호 10개 중 하나라도 걸리면 이 화면만 나와요.
            </p>
            <div className="emergency-signal-list">
              {emergencySignals.map((s) => (
                <span key={s.id} className="emergency-signal-tag">
                  {s.label}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* S8 결과 카드 (현재는 조건 충족 시만 렌더) */}
        {isResult && visit.result && (
          <Card>
            <div style={{ padding: '16px' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 600 }}>어느 과로 갈까요</p>
              <p style={{ margin: '0 0 12px', color: 'var(--c-text-2)', fontSize: '12px' }}>
                {t('result.dept.note')}
              </p>
              <p style={{ margin: '0 0 12px' }}>진료실에서 이렇게 말해요</p>
              <p style={{ margin: '0 0 12px' }}>꼭 물어볼 세 가지</p>
              <div className="c-card__actions">
                <Button kind="primary">복사</Button>
                <Button kind="secondary">PDF로 저장</Button>
              </div>
              <textarea
                className="c-card__textarea"
                placeholder={t('result.note.placeholder')}
                style={{ marginTop: '12px' }}
              />
            </div>
          </Card>
        )}

        {/* 일반 메시지 흐름 — 기록 기반 렌더 */}
        {!isEmergency && !isResult && (
          <>
            {messages.map((msg) =>
              msg.type === 'agent' ? (
                <AgentBubble key={msg.id} hint={msg.hint}>
                  {msg.body}
                </AgentBubble>
              ) : (
                <UserBubble key={msg.id} photo={msg.photo}>
                  {msg.text ?? ''}
                </UserBubble>
              ),
            )}
          </>
        )}

        {/* 칩 트레이 (S1) */}
        {showChips && (
          <ChipTray chips={whereChips} onSelect={handleChipSelect} />
        )}

        <div ref={chatEndRef} />
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        id="camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handlePhotoSelect}
      />

      {/* ===== C7 InputBar ===== */}
      <InputBar
        value={input}
        onChange={setInput}
        onSend={handleSendText}
        placeholder={t('input.placeholder')}
        hasCamera={!isEmergency}
        disabled={isEmergency}
        onCameraClick={triggerPhotoInput}
      />

      {/* ===== C9 Drawer ===== */}
      {sidebarOpen && (
        <Drawer
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewVisit={() => setConfirmVisible('new')}
          onClearAll={() => setConfirmVisible('clear')}
          hasActiveVisit={step !== STEPS.WHERE}
        />
      )}

      {/* ===== ConfirmDialog ===== */}
      <ConfirmDialog
        open={confirmVisible === 'new'}
        onClose={() => setConfirmVisible(null)}
        onConfirm={handleNewStart}
        title="새 진료 준비"
        body="진행 중 대화가 있으면 지금 것 버리고 새로 시작할까요?"
        confirmLabel="시작하기"
        variant="secondary"
      />
      <ConfirmDialog
        open={confirmVisible === 'clear'}
        onClose={() => setConfirmVisible(null)}
        onConfirm={handleClearAll}
        title="기록 전부 지우기"
        body={t('drawer.clear.confirm')}
        confirmLabel="지우기"
        variant="danger"
      />
    </div>
  )
}

export default App
