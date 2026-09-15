// src/api/chat.js
// 프론트 → /api/turn 어댑터. VITE_USE_MOCK=1 이면 목.

const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';

// 프론트 부위 ID를 백엔드 selected_part 내부 ID로 매핑
// ear·neck·nose → face_neck(이비인후과), waist·knee → back_joint(정형외과)
const PART_MAP = {
  ear: 'face_neck',
  neck: 'face_neck',
  nose: 'face_neck',
  waist: 'back_joint',
  knee: 'back_joint',
};

const ALLOWED_FRONT_PARTS = [
  'head',
  'eye',
  'ear',
  'neck',
  'nose',
  'chest',
  'abdomen',
  'waist',
  'knee',
  'skin',
];

export async function sendChatMessage(payload) {
  if (USE_MOCK) {
    return mockReply(payload);
  }

  const res = await fetch('/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBackendPayload(payload)),
  });
  if (!res.ok) throw new Error(`/api/turn failed: ${res.status}`);
  return fromBackendResponse(await res.json());
}

function toBackendPayload({ sessionId, profileId, message, visit }) {
  return {
    session_id: sessionId,
    turn_index: Number.isInteger(visit.turnIndex) ? visit.turnIndex : 1,
    user_text: message,
    selected_part:
      visit.part && ALLOWED_FRONT_PARTS.includes(visit.part)
        ? PART_MAP[visit.part] ?? visit.part
        : null,
    photos: (visit.photos ?? []).map((p) => ({
      label: p.label ?? null,
      caption: p.caption ?? null,
    })),
    profile: null,
    previous_note: visit.previousNote ?? null,
    history: {
      filled_fields: Array.isArray(visit.filledFields) ? visit.filledFields : [],
      last_emergency: !!(visit.emergency ?? false),
    },
  };
}

function fromBackendResponse(backend) {
  const { events, state, turn_index } = backend;

  let emergency = null;
  let result = null;
  let reply = null;
  let hint = null;
  let chips = [];

  for (const ev of events) {
    if (ev.event === 'safety' && ev.payload?.signal) {
      emergency = { signal: ev.payload.signal, cond: ev.payload.cond };
    }
    if (ev.event === 'ask') {
      reply = ev.body ?? null;
      hint = ev.hint ?? null;
      chips = Array.isArray(ev.payload?.chips) ? ev.payload.chips : [];
    }
    if (ev.event === 'result') {
      result = ev.payload;
    }
  }

  return {
    turnIndex: turn_index,
    events,
    state,
    emergency,
    result,
    reply,
    hint,
    chips,
  };
}

function mockReply({ message }) {
  return {
    turnIndex: 1,
    events: [],
    state: {
      body_part: null,
      symptom_desc: null,
      since_when: null,
      current_meds: [],
      tried_things: [],
    },
    emergency: null,
    result: null,
    reply: `확인했어요: ${message}`,
    hint: null,
    chips: [],
  };
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
    }));
}