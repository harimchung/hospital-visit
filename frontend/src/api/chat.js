// src/api/chat.js
const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

/**
 * 백엔드 채팅 API
 * 실제 스펙 받으면 path / body / 응답 파싱만 여기 수정
 *
 * @param {{
 *   sessionId: string,
 *   profileId: string | null,
 *   message: string,
 *   history: Array<{ role: 'user' | 'assistant', content: string }>
 * }} payload
 * @returns {Promise<{
 *   reply: string,
 *   hint?: string | null,
 *   chips?: Array<{ id: string, label: string, isEscape?: boolean }>,
 *   emergency?: { signal: string, cond: string } | null,
 *   result?: object | null,
 * }>}
 */
export async function sendChatMessage(payload) {
  // --- 아직 API 없을 때: 목 응답 (연결 전 개발용) ---
  if (!BASE_URL) {
    return mockReply(payload)
  }

  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`chat api failed: ${res.status}`)
  return res.json()
}

function mockReply({ message, history }) {
  // 첫 사용자 메시지 이후 등 — 개발용. API 오면 삭제/축소
  return {
    reply: `확인했어요: ${message}`,
    hint: null,
    chips: [],
    emergency: null,
    result: null,
  }
}

export function toApiHistory(messages) {
  return messages
    .filter((m) => m.type === 'agent' || m.type === 'user')
    .map((m) => ({
      role: m.type === 'agent' ? 'assistant' : 'user',
      content:
        m.type === 'agent'
          ? (typeof m.body === 'string' ? m.body : '')
          : (m.text ?? ''),
    }))
}