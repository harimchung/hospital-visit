import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react'
import { t } from './copy'
import {
  loadStore,
  saveStore,
  loadHistory,
  saveHistory,
  clearAll,
} from './storage'
import { sendChatMessage, toApiHistory } from './api/chat'
import { identifyPill } from './api/pill'
import { pickInitialWhereChips } from './initialChips'

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
  ProfileForm,
  PillFinderCard,
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

const PART_LABEL = {
  head: '머리',
  eye: '눈',
  ear: '귀',
  neck: '목',
  nose: '코',
  chest: '가슴',
  abdomen: '배',
  waist: '허리',
  knee: '무릎',
  skin: '피부',
}

function createOpeningMessages() {
  return [makeMessage('agent', { body: t('where.ask'), hint: t('where.hint') })]
}

function getInitialChipWidth() {
  if (typeof window === 'undefined') return 320
  return Math.max(200, window.innerWidth - 48)
}

/** 같은 id는 내용만 갱신하고, 목록은 createdAt 최신순 유지 */
function upsertHistory(list, session) {
  const next = [...list.filter((h) => h.id !== session.id), session]
  next.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  return next
}

const emptyVisit = () => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  part: null,
  photos: [],
  result: null,
  emergency: null,
  turnIndex: 1,
  filledFields: [],
  previousNote: null,
  state: null,
})

/** 백엔드 state 객체에서 채워진 필드 이름만 뽑아낸다. */
function deduceFilledFields(state) {
  const fields = []
  if (state.body_part) fields.push('body_part')
  if (state.symptom_desc) fields.push('symptom_desc')
  if (state.since_when) fields.push('since_when')
  if (state.current_meds && state.current_meds.length > 0)
    fields.push('current_meds')
  if (state.tried_things && state.tried_things.length > 0)
    fields.push('tried_things')
  return fields
}

/** 메시지 한 건 */
function makeMessage(type, payload) {
  return { id: crypto.randomUUID(), type, ...payload }
}

function cloneResult(result) {
  return result ? JSON.parse(JSON.stringify(result)) : null
}

function ResultCard({ result, photos }) {
  return (
    <Card>
      <h3 className="c-card__section-title">{t('card.dept.title')}</h3>
      <Card.DeptRankList depts={result.department_top3} />
      <Card.PhotoList photos={photos} />
      <p className="c-card__hint">{t('result.dept.note')}</p>

      <h3 className="c-card__section-title">{t('card.script.title')}</h3>
      <Card.ScriptList items={result.script} />

      <h3 className="c-card__section-title">{t('card.questions.title')}</h3>
      <Card.Questions items={result.questions} />

      <Card.Actions>
        <Button
          kind="primary"
          onClick={() =>
            navigator.clipboard.writeText(
              [
                ...(result.script || []),
                '',
                ...(result.questions || []).map((q, i) => `${i + 1}. ${q}`),
              ].join('\n'),
            )
          }
        >
          {t('card.action.copy')}
        </Button>
        <Button kind="secondary" onClick={() => window.print()}>
          {t('card.action.print')}
        </Button>
      </Card.Actions>

      <textarea
        className="c-card__textarea"
        placeholder={
          result.note_placeholder || t('result.note.placeholder')
        }
        style={{ marginTop: '12px' }}
      />
    </Card>
  )
}

function App() {
  const [visit, setVisit] = useState(emptyVisit())
  const visitRef = useRef(visit)
  useEffect(() => {
    visitRef.current = visit
  }, [visit])

  // 메시지 누적 배열 — 앱 화면의 실제 대화 기록
  const initial = loadStore()
  const [profiles, setProfiles] = useState(initial.profiles)
  const [selectedProfileId, setSelectedProfileId] = useState(null)
  const [history, setHistory] = useState(() => loadHistory(null))
  const [profileFormOpen, setProfileFormOpen] = useState(false)
  const [messages, setMessages] = useState(() => createOpeningMessages())
  const [step, setStep] = useState(STEPS.WHERE)
  const [chips, setChips] = useState(() =>
    pickInitialWhereChips(getInitialChipWidth()),
  )
  const [isSending, setIsSending] = useState(false)
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(null)
  const [pendingDeleteVisitId, setPendingDeleteVisitId] = useState(null)

  const messagesRef = useRef(null)
  const fileInputRef = useRef(null)
  const chatEndRef = useRef(null)
  const composerRef = useRef(null)

  // 메시지와 상태 카드가 나타날 때마다 메시지 영역 맨 아래로 스크롤
  useEffect(() => {
    const container = messagesRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, isSending, step, visit.emergency])

  const measureChipAreaWidth = useCallback(() => {
    const el = composerRef.current
    if (!el) return getInitialChipWidth()
    const styles = window.getComputedStyle(el)
    const pad =
      (parseFloat(styles.paddingLeft) || 0) +
      (parseFloat(styles.paddingRight) || 0)
    // chip-tray-dock 좌우 패딩(sp-3 = 12) 반영
    return Math.max(120, el.clientWidth - pad - 24)
  }, [])

  const resetInitialChips = useCallback(() => {
    setChips(pickInitialWhereChips(measureChipAreaWidth()))
  }, [measureChipAreaWidth])

  // 셸 실제 너비로 초기 부위 칩을 한 줄에 맞게 다시 배치
  useLayoutEffect(() => {
    resetInitialChips()
  }, [resetInitialChips])

  const isVisitComplete =
    step === STEPS.RESULT || messages.some((message) => message.type === 'result')
  const showChips =
    chips.length > 0 && !visit.emergency && !isSending && !isVisitComplete

  const applyAssistantResponse = useCallback((data) => {
    if (data.emergency) {
      setVisit((v) => ({ ...v, emergency: data.emergency }))
      setChips([])
      return
    }

    setVisit((v) => ({
      ...v,
      turnIndex: data.turnIndex,
      state: data.state ?? v.state ?? null,
      filledFields: data.state
        ? deduceFilledFields(data.state)
        : v.filledFields,
    }))

    if (data.reply) {
      setMessages((prev) => [
        ...prev,
        makeMessage('agent', {
          body: data.reply,
          hint: data.hint ?? null,
        }),
      ])
    }
    setChips(Array.isArray(data.chips) ? data.chips : [])
    if (data.result) {
      const result = cloneResult(data.result)
      setVisit((v) => ({ ...v, result }))
      setMessages((prev) => [
        ...prev,
        makeMessage('result', { result }),
      ])
      setStep(STEPS.RESULT)
    }
    if (data.uiAction === 'open_pill_finder') {
      setMessages((prev) => {
        const hasOpenFinder = prev.some(
          (message) =>
            message.type === 'pill-finder' && !message.pillFinder?.selected,
        )
        if (hasOpenFinder) return prev
        return [
          ...prev,
          makeMessage('pill-finder', {
            pillFinder: {
              shape: '',
              color: '',
              imprint: '',
              status: 'idle',
              candidates: [],
              selected: null,
              error: null,
            },
          }),
        ]
      })
    }

    const events = data.events ?? []
    const traceEvents = events.filter((e) => e.event !== 'done' && e.line)
    const doneEvent = events.find((e) => e.event === 'done')

    if (traceEvents.length > 0 || doneEvent) {
      setMessages((prev) => {
        let lastUserIndex = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].type === 'user') {
            lastUserIndex = i
            break
          }
        }
        if (lastUserIndex === -1) return prev

        const traceId = `trace-${data.turnIndex}`

        if (doneEvent) {
          const lines = [doneEvent.line]
          const existingIndex = prev.findIndex((m) => m.id === traceId)
          if (existingIndex !== -1) {
            return prev.map((m) =>
              m.id === traceId ? { ...m, lines, folded: true } : m,
            )
          }
          const next = [...prev]
          next.splice(lastUserIndex + 1, 0, {
            id: traceId,
            type: 'trace',
            lines,
            folded: true,
          })
          return next
        }

        const lines = traceEvents.map((e) => e.line)
        const existingIndex = prev.findIndex((m) => m.id === traceId)
        if (existingIndex !== -1) {
          return prev.map((m) =>
            m.id === traceId ? { ...m, lines, folded: false } : m,
          )
        }
        const next = [...prev]
        next.splice(lastUserIndex + 1, 0, {
          id: traceId,
          type: 'trace',
          lines,
          folded: false,
        })
        return next
      })
    }
  }, [])

  const sendUserTurn = useCallback(
    async (text) => {
      const v = visitRef.current
      if (!text || isSending || !!v.emergency || isVisitComplete) return
      const requestSessionId = v.id

      setMessages((prev) => [...prev, makeMessage('user', { text })])
      setChips([])
      setIsSending(true)

      try {
        const data = await sendChatMessage({
          sessionId: v.id,
          message: text,
          visit: v,
          profile: profiles.find((p) => p.id === selectedProfileId) || null,
        })
        if (visitRef.current.id !== requestSessionId) return
        applyAssistantResponse(data)
      } catch {
        if (visitRef.current.id !== requestSessionId) return
        setMessages((prev) => [
          ...prev,
          makeMessage('agent', {
            body: '잠시 연결이 안 돼요. 다시 보내 줄래요?',
            hint: null,
          }),
        ])
      } finally {
        if (visitRef.current.id === requestSessionId) {
          setIsSending(false)
        }
      }
    },
    [
      applyAssistantResponse,
      isSending,
      isVisitComplete,
      profiles,
      selectedProfileId,
    ],
  )

  const updatePillFinder = useCallback((messageId, patch) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              pillFinder: { ...message.pillFinder, ...patch },
            }
          : message,
      ),
    )
  }, [])

  const handlePillSearch = useCallback(
    async (messageId, params) => {
      const requestSessionId = visitRef.current.id
      updatePillFinder(messageId, {
        ...params,
        status: 'loading',
        candidates: [],
        error: null,
      })

      try {
        const candidates = await identifyPill(params)
        if (visitRef.current.id !== requestSessionId) return
        updatePillFinder(messageId, {
          status: 'success',
          candidates,
          error: null,
        })
      } catch (error) {
        if (visitRef.current.id !== requestSessionId) return
        updatePillFinder(messageId, {
          status: 'error',
          candidates: [],
          error:
            error instanceof Error
              ? error.message
              : '약 조회 중 오류가 발생했습니다.',
        })
      }
    },
    [updatePillFinder],
  )

  const handlePillSelect = useCallback(
    (messageId, candidate) => {
      if (!candidate?.name) return
      updatePillFinder(messageId, { selected: candidate })
      sendUserTurn(`복용한 약은 ${candidate.name}이에요.`)
    },
    [sendUserTurn, updatePillFinder],
  )

  // 칩 선택 → 사용자 메시지로 보내고 백엔드 응답 칩으로 교체
  const handleChipSelect = useCallback(
    (chip) => {
      if (!chip || !!visit.emergency || isSending) return
      if (chip.isBodyPart) {
        setVisit((v) => ({ ...v, part: chip.id }))
      }
      sendUserTurn(chip.label)
    },
    [isSending, sendUserTurn, visit.emergency],
  )

  const handleSendText = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setInput('')
    sendUserTurn(text)
  }, [input, sendUserTurn])

  // 사진 선택 (InputBar 연동용)
  const handlePhotoSelect = useCallback((e) => {
    if (isVisitComplete) return
    const file = e.target.files?.[0]
    if (!file) return

    const photo = {
      id: crypto.randomUUID(),
      blob: file,
      takenAt: new Date(),
    }
    const src = URL.createObjectURL(file)

    setVisit((v) => ({
      ...v,
      photos: [...v.photos, photo],
    }))
    setMessages((prev) => [
      ...prev,
      makeMessage('user', { photo: { src } }),
      makeMessage('agent', { body: t('photo.saved') }),
    ])

    e.target.value = ''
  }, [isVisitComplete])

  const triggerPhotoInput = () => {
    if (isVisitComplete) return
    fileInputRef.current?.click()
  }

  // 드로어/확인 처리
  const handleNewStart = () => {
    setConfirmVisible(null)
    if (messages.length > 0) {
      const session = snapshotSession(visit, messages, step, chips)
      const next = upsertHistory(history, session)
      setHistory(next)
      saveHistory(selectedProfileId, next)
    }
    const nextVisit = emptyVisit()
    visitRef.current = nextVisit
    setVisit(nextVisit)
    setMessages(createOpeningMessages())
    setStep(STEPS.WHERE)
    setInput('')
    setSidebarOpen(false)
    setIsSending(false)
    // 초기 부위 칩을 화면 너비 기준으로 다시 랜덤 배치
    resetInitialChips()
  }

  const handleOpenVisit = (id) => {
    if (id === visit.id) {
      setSidebarOpen(false)
      return
    }

    const session = history.find((h) => h.id === id)
    if (!session) return

    // 진행 중 대화만 저장. 순서는 createdAt 기준으로 유지 (맨 위로 끌어올리지 않음)
    let nextHistory = history
    if (messages.length > 0) {
      const saved = snapshotSession(visit, messages, step, chips)
      nextHistory = upsertHistory(history, saved)
      setHistory(nextHistory)
      saveHistory(selectedProfileId, nextHistory)
    }

    const restoredVisit = {
      ...session.visit,
      // 생성 시각은 히스토리 순서를 위해 보존
      createdAt: session.createdAt || session.visit?.createdAt,
      result: cloneResult(session.visit?.result),
    }
    visitRef.current = restoredVisit
    setVisit(restoredVisit)
    const restoredMessages = (session.messages || []).map((m) => ({
      ...m,
      body: plainBody(m.body),
      result: cloneResult(m.result),
      pillFinder: cloneResult(m.pillFinder),
    }))
    if (
      session.visit?.result &&
      !restoredMessages.some((message) => message.type === 'result')
    ) {
      restoredMessages.push({
        id: `result-${session.id}`,
        type: 'result',
        result: cloneResult(session.visit.result),
      })
    }
    setMessages(restoredMessages)
    const restoredStep = session.step || STEPS.WHERE
    setStep(restoredStep)
    setChips(
      Array.isArray(session.chips)
        ? session.chips
        : restoredStep === STEPS.WHERE
          ? pickInitialWhereChips(measureChipAreaWidth())
          : [],
    )
    setInput('')
    setSidebarOpen(false)
  }

  const handleDeleteVisit = () => {
    if (!pendingDeleteVisitId) return

    const nextHistory = history.filter(
      (session) => session.id !== pendingDeleteVisitId,
    )
    setHistory(nextHistory)
    saveHistory(selectedProfileId, nextHistory)

    if (pendingDeleteVisitId === visit.id) {
      const nextVisit = emptyVisit()
      visitRef.current = nextVisit
      setVisit(nextVisit)
      setMessages(createOpeningMessages())
      setStep(STEPS.WHERE)
      setInput('')
      setIsSending(false)
      resetInitialChips()
    }

    setPendingDeleteVisitId(null)
    setConfirmVisible(null)
  }

  const handleClearAll = () => {
    setConfirmVisible(null)
    clearAll()
    setHistory([])
    const nextVisit = emptyVisit()
    visitRef.current = nextVisit
    setVisit(nextVisit)
    setMessages(createOpeningMessages())
    setStep(STEPS.WHERE)
    setIsSending(false)
    resetInitialChips()
  }

  const handleAddProfile = (profile) => {
    const next = [...profiles, profile]
    setProfiles(next)
    const store = loadStore()
    store.profiles = next
    if (!store.historyByProfile[profile.id]) {
      store.historyByProfile[profile.id] = []
    }
    saveStore(store)
    setProfileFormOpen(false)
  }

  const handleSelectProfile = (id) => {
    if (messages.length > 0) {
      const saved = snapshotSession(visit, messages, step, chips)
      saved.profileId = selectedProfileId
      const next = upsertHistory(history, saved)
      setHistory(next)
      saveHistory(selectedProfileId, next)
    }

    const targetProfileId = id === selectedProfileId ? null : id
    setSelectedProfileId(targetProfileId)
    const store = loadStore()
    store.selectedProfileId = targetProfileId
    saveStore(store)

    setHistory(loadHistory(targetProfileId))
    const nextVisit = emptyVisit()
    visitRef.current = nextVisit
    setVisit(nextVisit)
    setMessages(createOpeningMessages())
    setStep(STEPS.WHERE)
    setIsSending(false)
    setInput('')
    resetInitialChips()
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

  const isEmergency = !!visit.emergency

  // 히스토리 열람 하는 부분 추가가

  function plainBody(body) {
    if (typeof body === 'string') return body
    if (
      body &&
      typeof body === 'object' &&
      typeof body.props?.children === 'string'
    ) {
      return body.props.children
    }
    return ''
  }
  function snapshotSession(visit, messages, step, chips) {
    const plainMessages = messages.map((m) => ({
      id: m.id,
      type: m.type,
      text: m.text ?? '',
      hint: m.hint ?? null,
      body: plainBody(m.body),
      lines: m.lines ?? undefined,
      folded: m.folded ?? undefined,
      photo: m.photo
        ? { src: m.photo.src }
        : undefined,
      result: cloneResult(m.result) ?? undefined,
      pillFinder: cloneResult(m.pillFinder) ?? undefined,
    }))
    const firstUser = plainMessages.find((m) => m.type === 'user' && m.text)
    return {
      id: visit.id,
      // 열람/저장할 때마다 시각을 바꾸지 않아 목록 순서가 유지된다
      createdAt: visit.createdAt || new Date().toISOString(),
      title: PART_LABEL[visit.part] || firstUser?.text || '진료 준비',
      summary: `대화 ${plainMessages.length}개`,
      visit: {
        id: visit.id,
        part: visit.part,
        photos: [],
        result: cloneResult(visit.result),
        emergency: visit.emergency,
        createdAt: visit.createdAt,
        turnIndex: visit.turnIndex ?? 1,
        filledFields: visit.filledFields ?? [],
        state: visit.state ?? null,
      },
      messages: plainMessages,
      step,
      chips: chips.map((chip) => ({ ...chip })),
      profileId: selectedProfileId,
    }
  }

  const currentSession =
    messages.length > 0
      ? {
          ...snapshotSession(visit, messages, step, chips),
          status: 'active',
          summary: '작성 중',
        }
      : null
  // 현재 세션을 맨 위에 올리지 않고, 생성 시각 순서 그대로 합친다
  const drawerVisits = currentSession
    ? upsertHistory(history, currentSession)
    : history

  const selectedProfile = profiles.find(
    (profile) => profile.id === selectedProfileId,
  )
  const visitPhotos = messages
    .filter((message) => message.photo?.src)
    .slice(0, 2)
    .map((message) => ({
      id: message.id,
      src: message.photo.src,
    }))

  return (
    <div className="app-layout">
      <Drawer
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onSelectProfile={handleSelectProfile}
        onAddProfile={() => setProfileFormOpen(true)}
        visits={drawerVisits}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenVisit={handleOpenVisit}
        onDeleteVisit={(id) => {
          setPendingDeleteVisitId(id)
          setConfirmVisible('delete')
        }}
        onNewVisit={() => {
          if (messages.length > 0) setConfirmVisible('new')
          else handleNewStart()
        }}
        onClearAll={() => setConfirmVisible('clear')}
        hasActiveVisit={messages.length > 0}
        currentVisitId={visit.id}
      />
      <main className="app-shell">
        {/* ===== C1 AppBar ===== */}
        <AppBar
          onHamburger={() => setSidebarOpen(true)}
          onProfile={() => setSidebarOpen(true)}
          rightLabel={selectedProfile?.nickname || '프로필 설정'}
          mode="default"
        />

        {/* ===== 메시지 영역 ===== */}
        <div className="messages" ref={messagesRef}>
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

          {/* 일반 메시지 흐름 — 기록 기반 렌더 */}
          {!isEmergency && (
            <>
              {messages.map((msg) =>
                msg.type === 'agent' ? (
                  <AgentBubble key={msg.id} hint={msg.hint}>
                    {msg.body}
                  </AgentBubble>
                ) : msg.type === 'trace' ? (
                  <div key={msg.id} className="trace-lines">
                    {(msg.lines || []).map((line, i) => (
                      <div key={i} className="trace-line">
                        {line}
                      </div>
                    ))}
                  </div>
                ) : msg.type === 'result' && msg.result ? (
                  <ResultCard
                    key={msg.id}
                    result={msg.result}
                    photos={visitPhotos}
                  />
                ) : msg.type === 'pill-finder' && msg.pillFinder ? (
                  <PillFinderCard
                    key={msg.id}
                    value={msg.pillFinder}
                    onChange={(patch) => updatePillFinder(msg.id, patch)}
                    onSearch={(params) =>
                      handlePillSearch(msg.id, params)
                    }
                    onSelect={(candidate) =>
                      handlePillSelect(msg.id, candidate)
                    }
                  />
                ) : (
                  <UserBubble key={msg.id} photo={msg.photo}>
                    {msg.text ?? ''}
                  </UserBubble>
                ),
              )}
              {/* 진행 상태 표시 (원칙 9) */}
              {isSending && (
                <AgentBubble>
                  <span className="progress-indicator" role="status">
                    <span className="progress-dot" aria-hidden="true" />
                    답을 정리하고 있어요
                  </span>
                </AgentBubble>
              )}
            </>
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
        <div className="composer" ref={composerRef}>
          {showChips && (
            <div className="chip-tray-dock">
              <ChipTray chips={chips} onSelect={handleChipSelect} />
            </div>
          )}

          {/* ===== C7 InputBar ===== */}
          <InputBar
            value={input}
            onChange={setInput}
            onSend={handleSendText}
            placeholder={t('input.placeholder')}
            hasCamera={!isEmergency && !isVisitComplete}
            disabled={isEmergency || isSending || isVisitComplete}
            onCameraClick={triggerPhotoInput}
          />
        </div>
      </main>

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
      <ProfileForm
        open={profileFormOpen}
        onClose={() => setProfileFormOpen(false)}
        onSubmit={handleAddProfile}
      />
      <ConfirmDialog
        open={confirmVisible === 'delete'}
        onClose={() => {
          setPendingDeleteVisitId(null)
          setConfirmVisible(null)
        }}
        onConfirm={handleDeleteVisit}
        title="진료 기록 삭제"
        body="이 진료 기록만 삭제할까요? 삭제한 기록은 되돌릴 수 없어요."
        confirmLabel="삭제"
        variant="danger"
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
