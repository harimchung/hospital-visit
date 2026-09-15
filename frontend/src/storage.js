const KEY = 'visitready.store'
const OLD_KEY = 'visitready.history'

const emptyStore = () => ({
  profiles: [],
  selectedProfileId: null,
  historyByProfile: { guest: [] },
})

function historyKey(profileId) {
  return profileId || 'guest'
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* fall through */
  }
  try {
    const old = localStorage.getItem(OLD_KEY)
    if (old) {
      const visits = JSON.parse(old)
      return {
        ...emptyStore(),
        historyByProfile: { guest: Array.isArray(visits) ? visits : [] },
      }
    }
  } catch {
    /* ignore */
  }
  return emptyStore()
}

export function saveStore(store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function loadHistory(profileId) {
  const store = loadStore()
  return store.historyByProfile[historyKey(profileId)] || []
}

export function saveHistory(profileId, visits) {
  const store = loadStore()
  store.historyByProfile[historyKey(profileId)] = visits
  saveStore(store)
}

export function clearAll() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(OLD_KEY)
}
