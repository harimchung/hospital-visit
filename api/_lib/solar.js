// _lib/solar.js
// Solar Pro 4 호출. UPSTAGE_API_KEY 사용. base_url https://api.upstage.ai/v1
// OpenAI 호환 chat completions. function calling 지원.
// 모델: solar-pro4

const SOLAR_BASE = 'https://api.upstage.ai/v1';
const SOLAR_MODEL = 'solar-pro4';

function headers() {
  const key = process.env.UPSTAGE_API_KEY;
  if (!key) throw new Error('UPSTAGE_API_KEY 누락');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export async function chatCompletion(messages, tools = null, toolChoice = null, maxTokens = 2560) {
  const body = {
    model: SOLAR_MODEL,
    messages,
    max_tokens: maxTokens,
  };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
  if (body.tools && toolChoice) body.tool_choice = toolChoice;

  const res = await fetch(`${SOLAR_BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Solar 호출 실패: ${res.status} ${text}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('Solar 응답 choices 없음: ' + JSON.stringify(data));
  return choice;
}

export function extractToolCall(choice) {
  const msg = choice.message;
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    return msg.tool_calls[0];
  }
  // JSON fallback: content에 JSON이 있으면 파싱
  if (typeof msg.content === 'string') {
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed.tool) {
        return {
          type: 'function',
          function: { name: parsed.tool, arguments: parsed.params || {} },
        };
      }
    } catch {}
  }
  return null;
}
