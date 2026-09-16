export async function identifyPill(params) {
  const response = await fetch('/api/pill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'pill_identify',
      params,
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `약 조회에 실패했습니다 (${response.status})`)
  }

  return data.result?.candidates ?? []
}
