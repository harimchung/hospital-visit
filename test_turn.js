// test_turn.js — api/turn.js의 POST 핸들러를 mock choice로 직접 돌리는 테스트 드라이버
// 외부 네트워크 없이 코드의 파싱·분기·ask·result·fallback 경로를 검증한다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = new URL('.', import.meta.url);
const TURN_JS_PATH = new URL('./api/turn.js', HERE).pathname;

// turn.js를 import하려면 동적 import + Vite ESM 환경 필요하므로,
// 여기서는 turn.js의 내부 함수를 복제하지 않고 핸들러 전체를 mock request로 호출한다.
// 각 시나리오를 JSON 요청으로 만들고, POST 핸들러가 반환할 Response를 수집한다.
//
// Solar 호출부(chatCompletion)는 턴마다 한 번만 호출되며, 이 테스트에서는
// SOLAR_BASE를 stubbing하지 않고 핸들러를 직접 실행하면 실제 키를 요구하므로
// 대신 가짜 choice를 반환하는 wrapper로 핸들러를 이식해 실행한다.
//
// 구현 방침:
//  - turn.js를 그대로 import하지 않고, 같은 파일 구조를 Node에서 실행 가능하도록
//    필요한 함수만 다시 정의하지 않는다. 대신 POST 핸들러를 fetch mock으로 대체할 수 있게
//    request 객체와 choice를 주입할 수 있는 테스트 전용 entry를 만든다.
//
// 테스트는 아래 4개 시나리오:
//  1) body: { user_text: '머리' }만 -> ask (칩 있음, result 없음)
//  2) body: { user_text: '3일 전부터 배가 쓰리고 타이레놀 먹고 있어' } -> 해 본 것 하나만 묻는 ask
//  3) state 5칸 다 채운 뒤 -> result에 대본 4~6문장, 질문 3개
//  4) Solar 답이 깨진 문자열 -> review 줄 + 규칙 조립 result

const STATE_FIELDS = ['body_part', 'symptom_desc', 'since_when', 'current_meds', 'tried_things'];

const CHIPS_5 = [
  { id: '약국', label: '약국에서 약 사 먹음' },
  { id: '진료', label: '병원 진료 받았음' },
  { id: '검사', label: '검사 받았음' },
  { id: '없음', label: '아직 아무것도 안 함' },
  { id: 'escape', label: '잘 모르겠어', isEscape: true },
];

// ---- 공통 응답 조각 (헬퍼) ----

function baseEvents(prefix) {
  return [
    {
      event: 'state',
      line: `${prefix} 읽음: 부위 배, 증상 쓰림, 언제부터 3일 전, 약 타이레놀 / 아직 안 읽은 것: 해 본 것`,
      body: null,
      hint: '부위·증상·약 확인 / 다음: 해 본 것',
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {
        filled_fields: ['body_part', 'symptom_desc', 'since_when', 'current_meds'],
        next_field: 'tried_things',
      },
    },
    {
      event: 'ask',
      line: '질문: 이미 해 본 조치가 있나요?',
      body: '이미 해 본 조치가 있나요?',
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {
        next_question: '이미 해 본 조치가 있나요?',
        filled_fields: ['body_part', 'symptom_desc', 'since_when', 'current_meds'],
        next_field: 'tried_things',
        chips: [...CHIPS_5],
      },
    },
    {
      event: 'done',
      line: 'done, 3단계 거침, 툴 0회, 응급 없음',
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    },
  ];
}

function baseEventsAllFilled(prefix) {
  return [
    {
      event: 'state',
      line: `${prefix} 읽음: 부위 배, 증상 쓰림, 언제부터 3일 전, 약 타이레놀, 해 본 것 약국`,
      body: null,
      hint: '채울 칸: 없음',
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {
        filled_fields: STATE_FIELDS.slice(),
        next_field: null,
      },
    },
    {
      event: 'result',
      line: '대본·질문 3개·진료과 1~3위 정리 완료',
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {
        department_top3: [
          { name: '내과', reason: '배 증상 + 규칙표 기준' },
          { name: '가정의학과', reason: '애매하면 가정의학과' },
          { name: '소화기내과', reason: '소화기 증상 동반 시' },
        ],
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
        photos: [],
        note_placeholder: '의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요',
      },
    },
    {
      event: 'done',
      line: 'done, 5단계 거침, 툴 0회, 응급 없음',
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    },
  ];
}

function baseEventsFallback(prefix) {
  return [
    {
      event: 'review',
      line: '모델 답 해석 실패, 규칙 조립',
      body: '현재 대화 내용을 바탕으로 대본을 만들었어요.',
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    },
    {
      event: 'result',
      line: '대본·질문 3개·진료과 1~3위 정리 완료',
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {
        department_top3: [
          { name: '내과', reason: '배 증상 + 규칙표 기준' },
          { name: '가정의학과', reason: '애매하면 가정의학과' },
          { name: '소화기내과', reason: '소화기 증상 동반 시' },
        ],
        script: [
          '배가 아파요.',
          '증상은 "쓰림"예요.',
          '3일 전부터 시작됐어요.',
          '타이레놀를 먹고 있어요.',
          '아직 정보가 부족해요. 더 알려주세요.',
        ],
        questions: [
          '이 약 계속 먹어도 되나요?',
          '아직 정보가 부족해요. 더 알려주세요.했는데 효과가 없어요. 다른 방법이 있나요?',
          '검사가 필요한가요?',
        ],
        photos: [],
        note_placeholder: '의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요',
      },
    },
    {
      event: 'done',
      line: 'done, 3단계 거침, 툴 0회, 응급 없음',
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    },
  ];
}
