/** 초기 부위 칩 후보 — 이 목록에서만 고른다 */
export const BODY_PART_CHIP_POOL = [
  { id: 'head', label: '머리' },
  { id: 'eye', label: '눈' },
  { id: 'ear', label: '귀' },
  { id: 'neck', label: '목' },
  { id: 'nose', label: '코' },
  { id: 'chest', label: '가슴' },
  { id: 'abdomen', label: '배' },
  { id: 'waist', label: '허리' },
  { id: 'knee', label: '무릎' },
  { id: 'skin', label: '피부' },
].map((c) => ({ ...c, isBodyPart: true }))

const CHIP_GAP = 8
const CHIP_PAD_X = 28 // padding 0 14 × 2
const CHIP_BORDER_X = 2

function shuffle(list) {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function measureLabelWidth(label) {
  if (typeof document === 'undefined') {
    return label.length * 14
  }
  const canvas =
    measureLabelWidth._canvas ||
    (measureLabelWidth._canvas = document.createElement('canvas'))
  const ctx = canvas.getContext('2d')
  ctx.font =
    '500 14px "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'
  return Math.ceil(ctx.measureText(label).width)
}

function chipWidth(label) {
  return measureLabelWidth(label) + CHIP_PAD_X + CHIP_BORDER_X
}

/**
 * 화면 너비에 맞춰 한 줄에 들어가는 만큼만 랜덤으로 고른다.
 * @param {number} maxWidth — 칩이 놓일 영역 너비(px)
 */
export function pickInitialWhereChips(maxWidth) {
  const width = Math.max(0, maxWidth || 0)
  const pool = shuffle(BODY_PART_CHIP_POOL)
  if (width <= 0) {
    return pool.slice(0, 4)
  }

  const picked = []
  let used = 0

  for (const chip of pool) {
    const w = chipWidth(chip.label)
    const next = picked.length === 0 ? w : used + CHIP_GAP + w
    if (picked.length > 0 && next > width) break
    picked.push(chip)
    used = next
  }

  return picked.length > 0 ? picked : pool.slice(0, 1)
}
