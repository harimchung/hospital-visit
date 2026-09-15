const KEY = 'visitready.history'

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveHistory(visits) {
  localStorage.setItem(KEY, JSON.stringify(visits))
}

export function clearHistory() {
  localStorage.removeItem(KEY)
}
