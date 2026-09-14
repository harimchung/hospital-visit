import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import { STEPS, getStepConfig, getNextStep, generateQuestions } from './steps'
import AppBar from './components/AppBar'
import { t } from './copy'
import AgentBubble from './components/AgentBubble'
import Hint from './components/Hint'
import UserBubble from './components/UserBubble'
import PhotoBubble from './components/PhotoBubble'
import ChipTray from './components/ChipTray'
import InputBar from './components/InputBar'
import Card from './components/Card'
import Drawer from './components/Drawer'
import Button from './components/Button'
import ConfirmDialog from './components/ConfirmDialog'


/* ================================================================
   응급 신호 판정 — design.md S9 키워드 표
   ================================================================ */

const EMERGENCY_SIGNALS = [
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

function detectEmergency(text, visit) {
  if (!text) return null
  const lower = text.toLowerCase().replace(/[\.\?\!\,\s]/g, ' ')

  // 의식 저하
  if (/\b(의식이|의식 저하|의식 없|정신 없|헛소리|횡설수설)\b/i.test(text)) {
    return { signal: '의식 저하', cond: '의식 저하가' }
  }

  // 한쪽 마비
  if (/\b(한쪽|반신|팔다리 힘|마비|감각 없|한쪽만)\b/i.test(text)) {
    return { signal: '한쪽 마비', cond: '한쪽 마비 증상이' }
  }

  // 흉통 20분 이상 (가슴 && 쥐어짜/조여/눌리 && 20분/30분/계속)
  if (visit.part === 'chest' || /가슴|chest/i.test(text)) {
    if (/\b(가슴|흉통|쥐어짜|조여|눌리|답답|숨 막)\b/i.test(text) &&
        /\b(20분|30분|계속|오래|안 없어|지속)\b/i.test(text)) {
      return { signal: '흉통 20분 이상', cond: '가슴 통증과' }
    }
    // 가슴 + how 통증 + since 오늘 → "지금 몇 분째예요?" 우선
    if (visit.how && visit.how.selected && visit.since === '오늘') {
      // 응급 신호 판정 전에 되묻기 처리 예정 — 여기선 우선 해당없음
    }
  }

  // 호흡곤란
  if (/\b(숨|호흡|숨쉬|호흡곤란|숨이|숨 못)\b/i.test(text)) {
    return { signal: '호흡곤란', cond: '숨쉬기 어려운 증상이' }
  }

  // 지혈 안 됨
  if (/\b(지혈|피 안 멎|피가 안|계속 나|상처)\b/i.test(text)) {
    return { signal: '지혈 안 됨', cond: '출혈이 멈추지 않는 상태가' }
  }

  // 급성 두통 (갑자기/생애 최고 + 두통)
  if (/\b(갑자기|급성|처음|생애 최고|벼락|극심)\b/i.test(text) &&
      /\b(두통|머리 통증|머리 아프|머리 깨질)\b/i.test(text)) {
    return { signal: '급성 두통', cond: '지금까지 경험한 것과 다른 심한 두통이' }
  }

  // 경련
  if (/\b(경련|발작|몸이 굳|떨림|의식 잃)\b/i.test(text)) {
    return { signal: '경련', cond: '경련이나 발작 증상이' }
  }

  // 토혈
  if (/\b(토혈|피를 토|커피색 토|검붉은 토|위장 출혈|토에서 피)\b/i.test(text)) {
    return { signal: '토혈', cond: '피를 토하는 증상이' }
  }

  // 딱딱한 복통 (배/복부 + 딱딱/굳/판판)
  if (/\b(배|복부|아랫배|윗배)\b/i.test(text) &&
      /\b(딱딱|판판|굳|만져|누르|압통|뻣뻣)\b/i.test(text)) {
    return { signal: '딱딱한 복통', cond: '배가 딱딱하게 굳는 복통이' }
  }

  // 고열 + 목 뻣뻣함
  if (/\b(고열|39도|38도|열|발열|체온)\b/i.test(text) &&
      /\b(목|뒷목|목 뻣뻣|목 경직|고개 못|숙여|목 뻣뻣함)\b/i.test(text)) {
    return { signal: '고열+목 뻣뻣함', cond: '고열과 목 뻣뻣함이 함께' }
  }

  return null
}

/* ================================================================
   부위 라벨 변환
   ================================================================ */

function partToLabel(partId) {
  const map = {
    head: '머리',
    face_neck: '눈, 귀, 코, 목',
    chest: '가슴',
    abdomen: '배',
    back_joint: '허리, 관절',
    skin: '피부',
    other: '그 외',
  }
  return map[partId] || partId
}

/* ================================================================
   결과 생성 — S8
   ================================================================ */

const DEPT_RULE_V1 = {
  head: [
    { name: '신경과', reason: '두통/어지럼증 관련' },
    { name: '내과', reason: '전신 상태 확인' },
  ],
  face_neck: [
    { name: '이비인후과', reason: '귀·코·목 증상' },
    { name: '내과', reason: '전신 상태 확인' },
  ],
  chest: [
    { name: '내과', reason: '흉통/호흡기 증상' },
    { name: '가정의학과', reason: '일차 진료' },
  ],
  abdomen: [
    { name: '내과', reason: '소화기 증상' },
    { name: '가정의학과', reason: '일차 진료' },
  ],
  back_joint: [
    { name: '정형외과', reason: '관절/척추 증상' },
    { name: '재활의학과', reason: '운동·재활 필요 시' },
  ],
  skin: [
    { name: '피부과', reason: '피부 증상' },
    { name: '가정의학과', reason: '일차 진료' },
    { name: '알레르기내과', reason: '가렵고 반복되면' },
  ],
  other: [
    { name: '가정의학과', reason: '일차 진료' },
    { name: '내과', reason: '전신 상태 확인' },
  ],
}

function generateScript(visit) {
  const part = visit.part ? partToLabel(visit.part) : ''
  const howDesc = visit.how ? visit.how.label : ''
  const worseDesc = visit.worse ? ` ${visit.worse.label}에 더 심해져요.` : ''
  const sinceDesc = visit.since ? ` ${visit.since}부터 그랬어요.` : ''
  const medDesc = visit.meds && visit.meds.length > 0
    ? ` 지금 먹는 약은 ${visit.meds.map(m => m.name).join(', ')}예요.`
    : ' 지금 특별히 먹는 약은 없어요.'
  const triedDesc = visit.tried?.visitNote
    ? ` 병원에서는 "${visit.tried.visitNote}"라고 하셨어요.`
    : ''

  return [
    `${part}이(가) ${howDesc}${sinceDesc}${worseDesc}`,
    `그래서 ${DEPT_RULE_V1[visit.part]?.[0]?.name || '가정의학과'} 진료를 보려고요.`,
    triedDesc,
    medDesc,
  ].filter(Boolean).join('\n')
}

function generateResult(visit) {
  const depts = DEPT_RULE_V1[visit.part] || DEPT_RULE_V1.other
  const script = generateScript(visit)
  const questions = generateQuestions(visit)
  return { depts, script, questions }
}

/* ================================================================
   메인 컴포넌트
   ================================================================ */

function App() {
  /* ---------- 방문 데이터 ---------- */

  const [visit, setVisit] = useState({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    profileId: null,
    part: null,
    multipleParts: [],
    how: null,
    worse: null,
    since: null,
    meds: null,
    tried: null,
    questions: [],
    result: null,
    photos: [],
    postNote: '',
    emergency: null,
  })

  /* ---------- 단계 / UI 상태 ---------- */

  const [step, setStep] = useState(STEPS.WHERE)
  const [chipTrayVisible, setChipTrayVisible] = useState(true)
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchPanelOpen, setSearchPanelOpen] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(null)
  const [progressVisible, setProgressVisible] = useState(false)

  /* ---------- 프로필/이력 (추후 IndexedDB 연동) ---------- */

  const [profiles, setProfiles] = useState([])
  const [history, setHistory] = useState([])

  /* ---------- 사진 상태 ---------- */

  const [pendingPhoto, setPendingPhoto] = useState(null)

  /* ---------- 스크롤 ---------- */

  const messagesRef = useRef(null)
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visit, step, input])

  /* ================================================================
   단계 구성
   ================================================================ */

  const stepConfig = getStepConfig(step, visit)
  const showChips = stepConfig?.chips && chipTrayVisible && !searchPanelOpen
  const isResult = step === STEPS.RESULT
  const isEmergency = !!visit.emergency
  const isSearch = searchPanelOpen

  /* ================================================================
   칩 선택 처리
   ================================================================ */

  const handleChipSelect = useCallback((chip) => {
    if (!chip || isEmergency) return
    const chipId = chip.id
    const chipLabel = chip.label

    // --- S1 where ---
    if (step === STEPS.WHERE) {
      if (chipId === 'multiple') {
        setVisit(v => ({
          ...v,
          multipleParts: v.part ? [...v.multipleParts, v.part] : [],
          part: null,
        }))
        return
      }
      setVisit(v => ({ ...v, part: chipId }))
      setChipTrayVisible(false)
      const next = getNextStep(STEPS.WHERE, { ...visit, part: chipId }, chipId)
      setStep(next || STEPS.PHOTO)
      return
    }

    // --- S2 photo ---
    if (step === STEPS.PHOTO) {
      if (chipId === 'take_photo') {
        document.getElementById('camera-input')?.click()
        return
      }
      if (chipId === 'next') {
        setChipTrayVisible(false)
        const next = getNextStep(STEPS.PHOTO, visit, chipId)
        setStep(next || STEPS.HOW)
        return
      }
    }

    // --- S3 how ---
    if (step === STEPS.HOW) {
      setVisit(v => ({
        ...v,
        how: { selected: chipId, label: chipLabel },
      }))
      setChipTrayVisible(false)
      const next = getNextStep(STEPS.HOW, visit, chipId)
      setStep(next || STEPS.WORSE)
      return
    }

    // --- S4 worse ---
    if (step === STEPS.WORSE) {
      setVisit(v => ({
        ...v,
        worse: { selected: chipId, label: chipLabel },
      }))
      setChipTrayVisible(false)
      const next = getNextStep(STEPS.WORSE, visit, chipId)
      setStep(next || STEPS.SINCE)
      return
    }

    // --- S4 since ---
    if (step === STEPS.SINCE) {
      setVisit(v => ({ ...v, since: chipLabel }))
      setChipTrayVisible(false)
      const next = getNextStep(STEPS.SINCE, visit, chipId)
      setStep(next || STEPS.MEDS)
      return
    }

    // --- since-retry ---
    if (step === STEPS.SINCE_RETRY) {
      setVisit(v => ({ ...v, since: chipLabel }))
      setChipTrayVisible(false)
      const next = getNextStep(STEPS.SINCE_RETRY, visit, chipId)
      setStep(next || STEPS.MEDS)
      return
    }

    // --- S5 meds ---
    if (step === STEPS.MEDS) {
      if (chipId === 'no_meds') {
        setVisit(v => ({ ...v, meds: [] }))
        setChipTrayVisible(false)
        setStep(STEPS.TRIED)
        return
      }
      if (chipId === 'find_by_shape') {
        setSearchPanelOpen(true)
        return
      }
      if (chipId === 'load_recent') {
        // TODO: IndexedDB에서 지난 처방약 로딩
        setChipTrayVisible(false)
        return
      }
      if (chipId === 'input_name') {
        document.getElementById('pill-input')?.focus()
        return
      }
    }

    // --- S7 tried ---
    if (step === STEPS.TRIED) {
      setVisit(v => ({
        ...v,
        tried: { selected: chipId, label: chipLabel },
      }))
      setChipTrayVisible(false)
      const nextStep = getNextStep(STEPS.TRIED, visit, chipId)
      if (chipId === 'hospital_visit') {
        setStep(STEPS.TRIED_VISIT)
      } else {
        setStep(nextStep || STEPS.QUESTIONS)
      }
      return
    }

    // --- S7 questions ---
    if (step === STEPS.QUESTIONS) {
      if (chipId === 'keep') {
        const result = generateResult(visit)
        setVisit(v => ({ ...v, ...result }))
        setStep(STEPS.RESULT)
        setChipTrayVisible(false)
        return
      }
      if (chipId === 'change') {
        setChipTrayVisible(false)
        // 칩 "1번/2번/3번" 선택 UI 추후
        return
      }
      if (chipId === 'add') {
        setChipTrayVisible(false)
        return
      }
    }
  }, [step, visit, isEmergency])

  /* ================================================================
   자유 입력 처리
   ================================================================ */

  const handleSendText = useCallback(() => {
    const text = input.trim()
    if (!text || isEmergency) return

    // 응급 판정
    const emergency = detectEmergency(text, visit)
    if (emergency) {
      setVisit(v => ({ ...v, emergency }))
      setStep(STEPS.RESULT)
      return
    }

    if (step === STEPS.WHERE) {
      const matched = matchBodyPart(text)
      if (matched) {
        setVisit(v => ({
          ...v,
          part: matched,
        }))
        setChipTrayVisible(false)
        const next = getNextStep(STEPS.WHERE, { ...visit, part: matched }, matched)
        setStep(next || STEPS.PHOTO)
        setInput('')
        return
      }
      // 매칭 실패 → 한 번 되묻기 (칩 없이 AgentBubble만)
      setInput('')
      return
    }

    if (step === STEPS.HOW) {
      setVisit(v => ({
        ...v,
        how: { selected: text, label: text },
      }))
      setChipTrayVisible(false)
      const next = getNextStep(STEPS.HOW, visit, text)
      setStep(next || STEPS.WORSE)
      setInput('')
      return
    }

    if (step === STEPS.SINCE) {
      const lower = text.toLowerCase()
      if (/\b(몰라|모르겠|모르겠어요|잘 모르겠)\b/i.test(text)) {
        // since-retry 1회
        setInput('')
        setStep(STEPS.SINCE_RETRY)
        return
      }
      setVisit(v => ({ ...v, since: text }))
      setChipTrayVisible(false)
      const next = getNextStep(STEPS.SINCE, visit, text)
      setStep(next || STEPS.MEDS)
      setInput('')
      return
    }

    if (step === STEPS.SINCE_RETRY) {
      setVisit(v => ({ ...v, since: text }))
      setChipTrayVisible(false)
      setStep(STEPS.MEDS)
      setInput('')
      return
    }

    if (step === STEPS.MEDS) {
      if (/\b(안 먹어|안 먹|먹지 않아|없어)\b/i.test(text)) {
        setVisit(v => ({ ...v, meds: [] }))
        setStep(STEPS.TRIED)
        setInput('')
        return
      }
      // 약 이름 입력 → 추후 API 연동
      setInput('')
      return
    }

    if (step === STEPS.TRIED_VISIT) {
      setVisit(v => ({
        ...v,
        tried: { ...v.tried, visitNote: text },
      }))
      setInput('')
      setStep(STEPS.QUESTIONS)
      return
    }

    if (step === STEPS.QUESTIONS) {
      if (/\b(이대로|그대로)\b/i.test(text)) {
        const result = generateResult(visit)
        setVisit(v => ({ ...v, ...result }))
        setStep(STEPS.RESULT)
        setChipTrayVisible(false)
        setInput('')
        return
      }
      if (/\b(하나 바꿀래|하나 바꿀|바꿀래)\b/i.test(text)) {
        setChipTrayVisible(false)
        setInput('')
        return
      }
      if (/\b(직접 추가|직접|추가)\b/i.test(text)) {
        setChipTrayVisible(false)
        setInput('')
        return
      }
    }

    setInput('')
  }, [step, visit, input, isEmergency])

  /* ================================================================
   부위 키워드 매칭 — design.md S1
   ================================================================ */

  function matchBodyPart(text) {
    const map = [
      [/머리|두통|머리가|머리쪽|이마/g, 'head'],
      [/눈|시력|눈이|시야가|시린|눈쪽/g, 'face_neck'],
      [/귀|코|목|인후|편도|목이|코쪽|귀쪽|목쪽/g, 'face_neck'],
      [/가슴|흉통|흉부|명치|심장|가슴쪽|가슴이/g, 'chest'],
      [/배|복부|아랫배|윗배|배쪽|속이/g, 'abdomen'],
      [/허리|관절|무릎|어깨|손목|발목|허리쪽|관절쪽|팔|다리|허리/g, 'back_joint'],
      [/피부|살|살쪽|몸|피부쪽|두드러기|발진| rash/g, 'skin'],
      [/여러 군데|여러곳|여기저기|전신/g, 'other'],
    ]
    for (const [pattern, id] of map) {
      if (pattern.test(text)) return id
    }
    return 'other'
  }

  /* ================================================================
   사진 처리
   ================================================================ */

  const handlePhotoSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const takenAt = new Date()
    const label = takenAt.getHours() >= 18 ? '밤' : '아침'

    const photo = {
      id: crypto.randomUUID(),
      blob: file,
      takenAt,
      label,
    }

    setPendingPhoto(photo)
    setVisit(v => ({
      ...v,
      photos: [...v.photos, photo],
    }))

    e.target.value = ''
  }, [])

  /* ================================================================
   드로어/확인
   ================================================================ */

  const openNewConfirm = () => setConfirmVisible('new')
  const openClearConfirm = () => setConfirmVisible('clear')
  const closeConfirm = () => setConfirmVisible(null)

  const handleNewStart = () => {
    closeConfirm()
    setVisit({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      profileId: null,
      part: null,
      multipleParts: [],
      how: null,
      worse: null,
      since: null,
      meds: null,
      tried: null,
      questions: [],
      result: null,
      photos: [],
      postNote: '',
      emergency: null,
    })
    setStep(STEPS.WHERE)
    setChipTrayVisible(true)
    setInput('')
    setSidebarOpen(false)
  }

  const handleClearAll = () => {
    closeConfirm()
    setVisit({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      profileId: null,
      part: null,
      multipleParts: [],
      how: null,
      worse: null,
      since: null,
      meds: null,
      tried: null,
      questions: [],
      result: null,
      photos: [],
      postNote: '',
      emergency: null,
    })
    setProfiles([])
    setHistory([])
    setStep(STEPS.WHERE)
    setChipTrayVisible(true)
  }

  /* ================================================================
   useEffect 정리
   ================================================================ */

  useEffect(() => {
    return () => {
      visit.photos.forEach(p => {
        if (p.blob instanceof Blob) URL.revokeObjectURL(p.blob)
      })
    }
  }, [visit.photos])

  /* ================================================================
   렌더링 — 컴포넌트 호출
   ================================================================ */

  return (
    <div className={`app-shell ${sidebarOpen ? '' : ''}`}>
      {/* ========== C1 AppBar ========== */}
      <AppBar
        onHamburger={() => setSidebarOpen(true)}
        onProfile={isSearch ? () => setSearchPanelOpen(false) : () => setSidebarOpen(true)}
        mode={isSearch ? 'search' : 'default'}
      />

      {/* ========== 메시지 영역 ========== */}
      <div className="messages" ref={messagesRef}>
        {/* --- 진행 상태 표시 (원칙 9) --- */}
        {progressVisible && (
          <div className="progress-indicator" role="status" aria-live="polite">
            <span className="progress-dot" aria-hidden="true" />
            {t('questions.hint')}
          </div>
        )}

        {/* --- 119 응급 카드 (S9) --- */}
        {isEmergency && visit.emergency && (
          <div
            className="emergency-card"
            role="alert"
            aria-live="assertive"
          >
            <div className="emergency-title">{t('emergency.title')}</div>
            <div className="emergency-body">
              {t('emergency.body', {
                signal: visit.emergency.signal,
                cond: visit.emergency.cond,
              })}
            </div>
            <a
              href="tel:119"
              className="emergency-cta"
              onClick={e => e.preventDefault()}
            >
              {t('emergency.cta')}
            </a>
            <p className="emergency-note" style={{ marginTop: '12px' }}>
              응급 신호 10개 중 하나라도 걸리면 이 화면만 나와요.
            </p>
            <div className="emergency-signal-list">
              {EMERGENCY_SIGNALS.map(s => (
                <span key={s.id} className="emergency-signal-tag">{s.label}</span>
              ))}
            </div>
          </div>
        )}

        {/* --- 결과 카드 (S8) --- */}
        {isResult && visit.result && (
          <div className="card" style={{ marginBottom: '16px' }}>
            {/* 1. 어느 과로 갈까요 */}
            <div className="card-section-title">어느 과로 갈까요</div>
            <div className="dept-rank-list">
              {visit.result.depts.map((d, i) => (
                <div key={d.name} className={`dept-rank dept-rank-${i + 1}`}>
                  <span className="dept-rank-num" aria-hidden="true">{i + 1}</span>
                  <div>
                    <div className="dept-rank-name">{d.name}</div>
                    <div className="dept-rank-reason">{d.reason}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="card-hint">{t('result.dept.note')}</p>

            {/* 2. 진료실에서 이렇게 말해요 */}
            <div className="card-section-title" style={{ marginTop: '16px' }}>
              진료실에서 이렇게 말해요
            </div>
            <ul className="script-list">
              {visit.result.script.split('\n').filter(Boolean).map((line, i) => (
                <li key={i} className="script-item">{line}</li>
              ))}
            </ul>

            {/* 3. 꼭 물어볼 세 가지 */}
            {visit.questions.length > 0 && (
              <>
                <div className="card-section-title" style={{ marginTop: '16px' }}>
                  꼭 물어볼 세 가지
                </div>
                <ol className="questions-list">
                  {visit.questions.slice(0, 3).map((q, i) => (
                    <li key={i} className="question-item">
                      <span className="question-num">{i + 1}</span>
                      <span className="question-text">{q}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {/* 4. 찍어 둔 사진 */}
            {visit.photos.length > 0 && (
              <>
                <div className="card-section-title" style={{ marginTop: '16px' }}>
                  찍어 둔 사진
                </div>
                <div className="photo-grid">
                  {visit.photos.map(p => (
                    <div
                      key={p.id}
                      className="photo-item"
                      style={{ backgroundImage: `url(${URL.createObjectURL(p.blob)})` }}
                    >
                      <div className="photo-caption">{p.label}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 5. 버튼 2개 */}
            <div className="card-actions">
              <button
                type="button"
                className="card-action-primary"
                onClick={() => {
                  const text = [
                    ...visit.result.script.split('\n'),
                    '',
                    ...visit.result.questions,
                  ].join('\n')
                  navigator.clipboard.writeText(text)
                }}
              >
                복사
              </button>
              <button
                type="button"
                className="card-action-secondary"
                onClick={() => window.print()}
              >
                PDF로 저장
              </button>
            </div>

            {/* 6. 진료 후 메모 */}
            <textarea
              id="post-note"
              className="post-note-field"
              placeholder={t('result.note.placeholder')}
              value={visit.postNote}
              onChange={e => setVisit(v => ({ ...v, postNote: e.target.value }))}
              onBlur={() => {
                // blur 시 자동 저장 (추후 IndexedDB 호출)
              }}
            />
          </div>
        )}

        {/* --- 일반 메시지 흐름 --- */}
        {!isEmergency && !isResult && (
          <>
            {/* S1 첫 질문 */}
            {step === STEPS.WHERE && (
              <div className="message-row agent">
                <div className="agent-bubble" aria-live="polite">
                  <p>{t('app.title')}</p>
                  <p style={{ marginTop: '4px' }}>어디가 아파요?</p>
                  <div className="hint">여러 군데면 '여러 군데'를 누르고 차례로 골라요</div>
                </div>
              </div>
            )}

            {/* S2 사진 질문 */}
            {step === STEPS.PHOTO &&
              visit.part &&
              ['skin', 'face_neck'].includes(visit.part) && (
                <div className="message-row agent">
                  <div className="agent-bubble" aria-live="polite">
                    <p>{t('photo.ask')}</p>
                  </div>
                </div>
              )}

            {/* S3 how */}
            {step === STEPS.HOW && visit.part && (
              <div className="message-row agent">
                <div className="agent-bubble" aria-live="polite">
                  <p>{`${partToLabel(visit.part)}가 어떻게 아파요?`}</p>
                  <div className="hint">칩은 고른 부위에 따라 바뀌어요</div>
                </div>
              </div>
            )}

            {/* S4 since */}
            {step === STEPS.SINCE && (
              <div className="message-row agent">
                <div className="agent-bubble" aria-live="polite">
                  <p>언제부터 그랬어요?</p>
                  <div className="hint">한 번만 되묻고, 그래도 모르면 '기억 안 남'으로 적어요</div>
                </div>
              </div>
            )}

            {/* S5 meds */}
            {step === STEPS.MEDS && (
              <div className="message-row agent">
                <div className="agent-bubble" aria-live="polite">
                  <p>지금 먹는 약 있어요? 처방약도 같이요.</p>
                  {history.length > 0 && (
                    <div className="hint">{t('meds.hint')}</div>
                  )}
                </div>
              </div>
            )}

            {/* S7 tried */}
            {step === STEPS.TRIED && (
              <div className="message-row agent">
                <div className="agent-bubble" aria-live="polite">
                  <p>낫게 하려고 해 본 거 있어요?</p>
                </div>
              </div>
            )}

            {/* S7 tried-visit */}
            {step === STEPS.TRIED_VISIT && (
              <div className="message-row agent">
                <div className="agent-bubble" aria-live="polite">
                  <p>{t('tried.visit')}</p>
                </div>
              </div>
            )}

            {/* S7 questions */}
            {step === STEPS.QUESTIONS && visit.questions.length > 0 && (
              <div className="message-row agent">
                <div className="agent-bubble" aria-live="polite">
                  <p>{t('questions.ask')}</p>
                  <div className="hint">{t('questions.hint')}</div>
                  <ol className="questions-list" style={{ marginTop: '8px', paddingLeft: '20px' }}>
                    {visit.questions.map((q, i) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{q}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* S6 pill.go */}
            {step === STEPS.MEDS && (
              <div className="message-row agent">
                <div className="agent-bubble" aria-live="polite">
                  <p style={{ marginTop: '4px' }}>{t('pill.go')}</p>
                </div>
              </div>
            )}

            {/* --- 사용자 메시지 (입력 중) --- */}
            {input !== '' && (
              <div className="message-row user">
                <div className="user-bubble">
                  <p>{input}</p>
                </div>
              </div>
            )}

            {/* --- PhotoBubble --- */}
            {pendingPhoto && (
              <div className="message-row user">
                <div className="user-bubble">
                  <p>{pendingPhoto.label}</p>
                  <div className="photo-row">
                    <div
                      className="photo-thumb"
                      style={{ backgroundImage: `url(${URL.createObjectURL(pendingPhoto.blob)})` }}
                    />
                    <div className="photo-caption">{pendingPhoto.label}</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- 칩 트레이 (C6) --- */}
        {showChips && (
          <div className="message-row agent">
            <ChipTray
                chips={stepConfig.chips}
                selectedId={
                  step === STEPS.HOW ? visit.how?.selected :
                  step === STEPS.WORSE ? visit.worse?.selected :
                  step === STEPS.SINCE ? visit.since :
                  step === STEPS.SINCE_RETRY ? visit.since :
                  step === STEPS.TRIED ? visit.tried?.selected :
                  null
                }
                onSelect={handleChipSelect}
              />
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ========== C7 InputBar ========== */}
      <InputBar
        value={input}
        onChange={setInput}
        onSend={handleSendText}
        placeholder={t('input.placeholder')}
        hasCamera={!isSearch}
        disabled={isEmergency || isSearch}
        pillMode={isSearch}
        onPhotoSelect={handlePhotoSelect}
      />

      {/* ========== C9 Drawer ========== */}
      {sidebarOpen && (
        <Drawer
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          profiles={profiles}
          selectedProfileId={visit.profileId}
          onSelectProfile={(profileId) => setVisit(v => ({ ...v, profileId }))}
          visits={history}
          onOpenVisit={() => {
            // TODO: S8 읽기 전용 열기
          }}
          onNewVisit={openNewConfirm}
          onClearAll={openClearConfirm}
          hasActiveVisit={step !== STEPS.WHERE}
        />
      )}

      {/* ========== 확인 시트 ========== */}
      <ConfirmDialog
        open={confirmVisible === 'new'}
        onClose={closeConfirm}
        onConfirm={handleNewStart}
        title="새 진료 준비"
        body="진행 중 대화가 있으면 지금 것 버리고 새로 시작할까요?"
        confirmLabel="시작하기"
      />

      <ConfirmDialog
        open={confirmVisible === 'clear'}
        onClose={closeConfirm}
        onConfirm={handleClearAll}
        title="기록 전부 지우기"
        body={t('drawer.clear.confirm')}
        confirmLabel="지우기"
      />
    </div>
  )
}

function formatDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default App
