// test_turn.mjs — api/turn.js POST 핸들러를 mock Solar choice로 실제 실행
// 외부 패키지 없이 node로 실행. Solar 호출만 가로채서 각 시나리오를 검증.
// 키가 없어도 solar.js가 fetch 전에 UPSTAGE_API_KEY를 요구하므로 목키로 우회.

import { POST } from './api/turn.js';

process.env.UPSTAGE_API_KEY = 'MOCK_UPSTAGE_KEY';

const MOCKS = {
  scenario1: {
    message: {
      role: 'assistant',
      content: JSON.stringify({
        state: {
          body_part: 'head',
          symptom_desc: '',
          since_when: '',
          current_meds: [],
          tried_things: [],
        },
        next_field: 'symptom_desc',
        question: '머리에서 어떤 증상이 있나요?',
        chips: [
          { id: '욱신', label: '욱신거려요' },
          { id: '찌릿', label: '찌릿해요' },
          { id: '무감', label: '감각이 이상해요' },
          { id: 'escape', label: '잘 모르겠어', isEscape: true },
        ],
        emergency_suspected: false,
        script: [],
        questions: [],
      }),
    },
  },
  scenario2: {
    message: {
      role: 'assistant',
      content: JSON.stringify({
        state: {
          body_part: 'abdomen',
          symptom_desc: '쓰림',
          since_when: '3일 전',
          current_meds: ['타이레놀'],
          tried_things: [],
        },
        next_field: 'tried_things',
        question: '소염제나 지사제 같은 걸 먹어 봤나요?',
        chips: [
          { id: '약국', label: '약국에서 약 사 먹음' },
          { id: '진료', label: '병원 진료 받았음' },
          { id: '검사', label: '검사 받았음' },
          { id: '없음', label: '아직 아무것도 안 함' },
          { id: 'escape', label: '잘 모르겠어', isEscape: true },
        ],
        emergency_suspected: false,
        script: [],
        questions: [],
      }),
    },
  },
  scenario3: {
    message: {
      role: 'assistant',
      content: JSON.stringify({
        state: {
          body_part: 'abdomen',
          symptom_desc: '쓰림',
          since_when: '3일 전',
          current_meds: ['타이레놀'],
          tried_things: ['약국에서 약 사 먹음'],
        },
        next_field: null,
        question: '',
        chips: [],
        emergency_suspected: false,
        script: [
          '배가 쓰린 지는 3일 전부터예요.',
          '타이레놀을 먹고 있어요.',
          '약국에서 약을 사 먹었어요.',
          '처방전이나 약 봉투를 확인해서 정확한 이름을 적어올게요.',
        ],
        questions: [
          '이 약 계속 먹어도 되나요?',
          '약국에서 산 약 말고 다른 방법이 있나요?',
          '검사를 받아야 하나요?',
        ],
      }),
    },
  },
  scenario4: {
    message: {
      role: 'assistant',
      content: '{ 깨진',
    },
  },
};

let currentScenario = null;
const originalFetch = globalThis.fetch;

globalThis.fetch = (url, opts) => {
  if (typeof url === 'string' && url.includes('/chat/completions')) {
    const mock = MOCKS[currentScenario];
    if (!mock) throw new Error('현재 시나리오 모의 없음: ' + currentScenario);
    return new Response(JSON.stringify({ choices: [mock] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // 그 외 fetch는 없어야 정상
  return new Response(null, { status: 404 });
};

async function runScenario(name, requestBody) {
  currentScenario = name;
  try {
    const req = new Request('http://localhost/api/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const res = await POST(req);
    const data = await res.json();
    console.log(JSON.stringify({ scenario: name, request: requestBody, response: data }, null, 2));
  } finally {
    currentScenario = null;
  }
}

async function main() {
  await runScenario('시나리오1: 머리만', {
    session_id: 's1',
    turn_index: 1,
    user_text: '머리',
    selected_part: null,
    photos: [],
    profile: null,
    previous_note: null,
    history: { filled_fields: [], last_emergency: false },
  });

  await runScenario('시나리오2: 3일 전부터 배가 쓰리고 타이레놀 먹고 있어', {
    session_id: 's2',
    turn_index: 1,
    user_text: '3일 전부터 배가 쓰리고 타이레놀 먹고 있어',
    selected_part: null,
    photos: [],
    profile: null,
    previous_note: null,
    history: { filled_fields: [], last_emergency: false },
  });

  await runScenario('시나리오3: 5칸 다 채운 뒤', {
    session_id: 's3',
    turn_index: 1,
    user_text: '배 쓰림',
    selected_part: 'abdomen',
    photos: [],
    profile: null,
    previous_note: null,
    history: { filled_fields: [], last_emergency: false },
    state: {
      body_part: 'abdomen',
      symptom_desc: '쓰림',
      since_when: '3일 전',
      current_meds: ['타이레놀'],
      tried_things: ['약국에서 약 사 먹음'],
    },
  });

  await runScenario('시나리오4: Solar 답을 일부러 깨진 문자열로', {
    session_id: 's4',
    turn_index: 1,
    user_text: '3일 전부터 배가 쓰리고 타이레놀 먹고 있어',
    selected_part: null,
    photos: [],
    profile: null,
    previous_note: null,
    history: { filled_fields: [], last_emergency: false },
  });
}

main().catch((e) => {
  console.error('드라이버 에러', e);
  process.exit(1);
});
