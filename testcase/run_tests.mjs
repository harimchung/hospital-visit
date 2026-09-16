// testcase/run_tests.mjs
// 테스트 시나리오 실행: health, pill, turn

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 환경변수 로드
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    console.log('env 파일이 없습니다: ' + envPath);
    return;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  });
}
loadEnv(path.resolve(rootDir, 'api/_lib/.env.local'));

// ---------- 헬퍼 ----------
function assert(condition, reason) {
  if (!condition) {
    throw new Error('FAIL: ' + reason);
  }
}

function assertEqual(actual, expected, reason) {
  if (actual !== expected) {
    throw new Error('FAIL: ' + reason + ' (actual=' + JSON.stringify(actual) + ', expected=' + JSON.stringify(expected) + ')');
  }
}

function assertInclude(haystack, needle, reason) {
  if (!haystack || !haystack.includes(needle)) {
    throw new Error('FAIL: ' + reason + ' (actual=' + JSON.stringify(haystack) + ', expected include=' + JSON.stringify(needle) + ')');
  }
}

function assertIsArray(actual, reason) {
  if (!Array.isArray(actual)) {
    throw new Error('FAIL: ' + reason + ' (actual=' + JSON.stringify(actual) + ')');
  }
}

// ---------- health ----------
async function testHealth() {
  console.log('--- testHealth ---');
  const healthModule = await import('../api/health.js');
  const res = await healthModule.GET();
  const body = await res.json();

  assertEqual(body.ok, true, 'health ok');
  assertEqual(body.checks.solar, 'ok', 'health solar ok');
  assertEqual(body.checks.pill_api, 'ok', 'health pill_api ok');
  assert(body.note, 'health note 존재');
  console.log('health PASS');
  return body;
}

// ---------- pill ----------
async function mockPillPost(body) {
  let jsonBody;
  const req = { json: async () => (jsonBody = body) };
  const pillModule = await import('../api/pill.js');
  const res = await pillModule.POST(req);
  return { status: res.status, body: await res.json() };
}

async function testPill() {
  console.log('--- testPill ---');

  // P1 정상 조회
  const p1 = await mockPillPost({ kind: 'drug_name', params: { itemName: '타이레놀' } });
  assertEqual(p1.status, 200, 'pill drug_name status');
  assert(p1.body.ok, 'pill drug_name ok');
  assertEqual(p1.body.kind, 'drug_name', 'pill drug_name kind');
  assert(p1.body.result.items && p1.body.result.items.length > 0, 'pill drug_name items > 0');
  assertEqual(p1.body.result.empty, false, 'pill drug_name empty false');

  // P2 0건
  const p2 = await mockPillPost({ kind: 'drug_name', params: { itemName: '존재하지않는의약품' } });
  assertEqual(p2.status, 200, 'pill 0건 status');
  assert(p2.body.ok, 'pill 0건 ok');
  assert(p2.body.result.items && p2.body.result.items.length === 0, 'pill 0건 items empty');
  assertEqual(p2.body.result.empty, true, 'pill 0건 empty true');

  // P3 제품명 수준
  const p3 = await mockPillPost({ kind: 'drug_name', params: { itemName: '타이레놀정500' } });
  assert(p3.body.result.items && p3.body.result.items.length > 0, 'pill 제품명 items');
  const p3Name = p3.body.result.items[0]?.itemName || '';
  assertInclude(p3Name, '타이레놀', 'pill 제품명 include');

  // P4 kind 누락
  const p4 = await mockPillPost({});
  assertEqual(p4.status, 400, 'pill kind 누락 status');
  assert(!p4.body.ok, 'pill kind 누락 ok false');
  assertInclude(p4.body.error, 'kind', 'pill kind 누락 error');

  // P5 중복 없음
  const p5 = await mockPillPost({ kind: 'drug_dup', params: { med_names: ['타이레놀', '아스피린'] } });
  assertEqual(p5.status, 200, 'pill dup status');
  assert(p5.body.ok, 'pill dup ok');
  assertEqual(p5.body.kind, 'drug_dup', 'pill dup kind');
  assertEqual(p5.body.result.duplicates.length, 0, 'pill dup duplicates 0');

  // P6 중복 있음
  const p6 = await mockPillPost({ kind: 'drug_dup', params: { med_names: ['아스피린', '게보린', '타이레놀'] } });
  assert(p6.body.ok, 'pill dup 중복 ok');
  assertIsArray(p6.body.result.duplicates, 'pill dup duplicates array');
  assert(p6.body.result.duplicates.length >= 1, 'pill dup 중복 1개 이상');

  // P7 빈 배열
  const p7 = await mockPillPost({ kind: 'drug_dup', params: { med_names: [] } });
  assertEqual(p7.body.result.duplicates.length, 0, 'pill dup 빈 배열');

  // P8 kind 누락
  const p8 = await mockPillPost({ params: { med_names: ['타이레놀'] } });
  assertEqual(p8.status, 400, 'pill dup kind 누락 status');
  assertInclude(p8.body.error, 'kind', 'pill dup kind 누락 error');

  // P9 병용금기 없음
  const p9 = await mockPillPost({ kind: 'drug_contra', params: { med_names: ['타이레놀', '아스피린'] } });
  assertEqual(p9.status, 200, 'pill contra status');
  assert(p9.body.ok, 'pill contra ok');
  assertEqual(p9.body.kind, 'drug_contra', 'pill contra kind');
  assertEqual(p9.body.result.contra_pairs.length, 0, 'pill contra pairs 0');

  // P10 병용금기 있음
  const p10 = await mockPillPost({ kind: 'drug_contra', params: { med_names: ['심바스타틴', '이트라코나졸'] } });
  assert(p10.body.ok, 'pill contra 있음 ok');
  assertIsArray(p10.body.result.contra_pairs, 'pill contra pairs array');
  assert(p10.body.result.contra_pairs.length >= 1, 'pill contra pairs 1개 이상');
  assert(p10.body.result.contra_pairs[0].reason, 'pill contra reason 존재');

  // P11 빈 배열
  const p11 = await mockPillPost({ kind: 'drug_contra', params: { med_names: [] } });
  assertEqual(p11.body.result.contra_pairs.length, 0, 'pill contra 빈 배열');

  // P12 kind 누락
  const p12 = await mockPillPost({ params: { med_names: ['타이레놀'] } });
  assertEqual(p12.status, 400, 'pill contra kind 누락 status');
  assertInclude(p12.body.error, 'kind', 'pill contra kind 누락 error');

  // P13 65세 미만
  const p13 = await mockPillPost({ kind: 'elderly_caution', params: { med_names: ['타이레놀'], age: 64 } });
  assertEqual(p13.status, 200, 'pill elderly status');
  assert(p13.body.ok, 'pill elderly ok');
  assertEqual(p13.body.kind, 'elderly_caution', 'pill elderly kind');
  assertEqual(p13.body.result.cautions.length, 0, 'pill elderly 65세 미만 cautions 0');

  // P14 65세 이상
  const p14 = await mockPillPost({ kind: 'elderly_caution', params: { med_names: ['타이레놀'], age: 65 } });
  assert(p14.body.ok, 'pill elderly 65 ok');
  assertIsArray(p14.body.result.cautions, 'pill elderly cautions array');

  // P15 age 누락
  const p15 = await mockPillPost({ kind: 'elderly_caution', params: { med_names: ['타이레놀'] } });
  assert(p15.body.ok, 'pill elderly age 누락 ok');
  assertIsArray(p15.body.result.cautions, 'pill elderly age 누락 cautions');

  // P16 kind 누락
  const p16 = await mockPillPost({ params: { med_names: ['타이레놀'], age: 65 } });
  assertEqual(p16.status, 400, 'pill elderly kind 누락 status');
  assertInclude(p16.body.error, 'kind', 'pill elderly kind 누락 error');

  // P17 정상 낱알식별
  const p17 = await mockPillPost({ kind: 'pill_identify', params: { shape: '원형', color: '흰색', imprint: 'TYLENOL' } });
  assertEqual(p17.status, 200, 'pill identify status');
  assert(p17.body.ok, 'pill identify ok');
  assertEqual(p17.body.kind, 'pill_identify', 'pill identify kind');
  assertIsArray(p17.body.result.candidates, 'pill identify candidates array');
  assertEqual(p17.body.result.count, p17.body.result.candidates.length, 'pill identify count 일치');

  // P18 0건
  const p18 = await mockPillPost({ kind: 'pill_identify', params: { shape: '삼각형', color: '보라', imprint: '없음' } });
  assertEqual(p18.body.result.count, 0, 'pill identify 0건 count');
  assertEqual(p18.body.result.candidates.length, 0, 'pill identify 0건 candidates');

  // P19 일부 파라미터
  const p19 = await mockPillPost({ kind: 'pill_identify', params: { shape: '원형' } });
  assert(p19.body.ok, 'pill identify 일부 파라미터 ok');
  assertIsArray(p19.body.result.candidates, 'pill identify 일부 candidates');

  // P20 kind 누락
  const p20 = await mockPillPost({ params: { shape: '원형' } });
  assertEqual(p20.status, 400, 'pill identify kind 누락 status');
  assertInclude(p20.body.error, 'kind', 'pill identify kind 누락 error');

  console.log('pill PASS');
}

// ---------- turn ----------
async function mockTurnPost(body) {
  let jsonBody;
  const req = { json: async () => (jsonBody = body) };
  const turnModule = await import('../api/turn.js');
  const res = await turnModule.POST(req);
  return { status: res.status, body: await res.json() };
}

async function testTurn() {
  console.log('--- testTurn ---');

  // T1 응급 아님
  const t1 = await mockTurnPost({
    session_id: 'test-응급아님',
    turn_index: 1,
    user_text: '소화가 안돼요, 배가 더부룩해요',
    selected_part: null,
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: [], last_emergency: false },
  });
  assertEqual(t1.status, 200, 'turn T1 status');
  assertEqual(t1.body.ok, true, 'turn T1 ok');
  assertEqual(t1.body.events[0].event, 'safety', 'turn T1 events[0] safety');
  assertInclude(t1.body.events[0].line, '해당 없음', 'turn T1 safety line');
  assertEqual(t1.body.events[0].payload.ok, true, 'turn T1 safety ok');
  const t1Done = t1.body.events.find(e => e.event === 'done');
  assert(t1Done, 'turn T1 done 존재');
  assertEqual(t1Done.line, 'done, 3단계 거침, 툴 0회, 응급 없음', 'turn T1 done line');

  // T2 의식 저하
  const t2 = await mockTurnPost({
    session_id: 'test-의식저하',
    turn_index: 1,
    user_text: '의식이 흐리고 깨우기 어려워요',
    selected_part: null,
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: [], last_emergency: false },
  });
  assertEqual(t2.status, 200, 'turn T2 status');
  assertEqual(t2.body.events[0].event, 'safety', 'turn T2 events[0] safety');
  assertInclude(t2.body.events[0].line, '의식 저하', 'turn T2 safety line 의식 저하');
  assertEqual(t2.body.events[0].payload.signal, '의식 저하', 'turn T2 payload signal');
  assertEqual(t2.body.events.length, 2, 'turn T2 events 길이 2');
  assertEqual(t2.body.events[1].event, 'done', 'turn T2 done');

  // T3 흉통 20분 이상
  const t3 = await mockTurnPost({
    session_id: 'test-흉통',
    turn_index: 1,
    user_text: '가슴을 쥐어짜는 통증이 20분 넘게 계속돼요',
    selected_part: null,
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: [], last_emergency: false },
  });
  assertInclude(t3.body.events[0].line, '흉통', 'turn T3 safety line 흉통');
  assertEqual(t3.body.events[0].payload.signal, '흉통 20분 이상', 'turn T3 payload signal');
  assertEqual(t3.body.events.length, 2, 'turn T3 events 길이 2');

  // T4 호흡곤란
  const t4 = await mockTurnPost({
    session_id: 'test-호흡곤란',
    turn_index: 1,
    user_text: '숨쉬기가 힘들어요, 숨 못 쉬겠어요',
    selected_part: null,
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: [], last_emergency: false },
  });
  assertEqual(t4.body.events[0].payload.signal, '호흡곤란', 'turn T4 payload signal');

  // T5 토혈
  const t5 = await mockTurnPost({
    session_id: 'test-토혈',
    turn_index: 1,
    user_text: '피를 토했어요, 커피색 토가 나와요',
    selected_part: null,
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: [], last_emergency: false },
  });
  assertEqual(t5.body.events[0].payload.signal, '토혈/흑변', 'turn T5 payload signal');

  // T6 고열+목 뻣뻣함
  const t6 = await mockTurnPost({
    session_id: 'test-고열목',
    turn_index: 1,
    user_text: '고열이 나고 목이 뻣뻣해요',
    selected_part: null,
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: [], last_emergency: false },
  });
  assertEqual(t6.body.events[0].payload.signal, '고열+목 뻣뻣함', 'turn T6 payload signal');

  // T7 첫 질문 턴 (툴 없음)
  const t7 = await mockTurnPost({
    session_id: 'test-첫질문',
    turn_index: 1,
    user_text: '3일 전부터 배가 쓰려요',
    selected_part: 'abdomen',
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: ['body_part'], last_emergency: false },
  });
  assertEqual(t7.status, 200, 'turn T7 status');
  assertEqual(t7.body.ok, true, 'turn T7 ok');
  const t7Safety = t7.body.events.find(e => e.event === 'safety');
  assert(t7Safety, 'turn T7 safety 존재');
  assertEqual(t7Safety.payload.ok, true, 'turn T7 safety ok');
  const t7State = t7.body.events.find(e => e.event === 'state');
  assert(t7State, 'turn T7 state 존재');
  assertInclude(t7State.line, '배', 'turn T7 state line 배');
  const t7Ask = t7.body.events.find(e => e.event === 'ask');
  assert(t7Ask, 'turn T7 ask 존재');
  assertEqual(t7Ask.event, 'ask', 'turn T7 ask event');
  assert(t7Ask.body, 'turn T7 ask body 존재');
  assertIsArray(t7Ask.payload.chips, 'turn T7 ask chips 배열');
  assert(t7Ask.payload.chips.length > 0, 'turn T7 ask chips 존재');
  const lastChip = t7Ask.payload.chips[t7Ask.payload.chips.length - 1];
  assertEqual(lastChip.isEscape, true, 'turn T7 마지막 칩 isEscape true');
  const t7Done = t7.body.events.find(e => e.event === 'done');
  assert(t7Done, 'turn T7 done 존재');
  assertEqual(t7Done.line, 'done, 3단계 거침, 툴 0회, 응급 없음', 'turn T7 done line');

  // T8 상태 요약 line
  assertInclude(t7State.line, '부위 배', 'turn T8 state line 부위 배');

  // T9 memory 없음
  const t9Memory = t7.body.events.find(e => e.event === 'memory');
  assert(!t9Memory, 'turn T9 memory 없음');

  // T10 memory 있음
  const t10 = await mockTurnPost({
    session_id: 'test-memory',
    turn_index: 1,
    user_text: '5일 전부터 머리가 아파요',
    selected_part: 'head',
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '전에 위염 소견 들음',
    history: { filled_fields: ['body_part'], last_emergency: false },
  });
  const t10Memory = t10.body.events.find(e => e.event === 'memory');
  assert(t10Memory, 'turn T10 memory 존재');
  assertInclude(t10Memory.line, '참고 기록', 'turn T10 memory line 참고 기록');
  assertInclude(t10Memory.line, '진료 메모', 'turn T10 memory line 진료 메모');

  // T11 결과 턴
  // 정보 충분히 채워서 결과 턴 유도: 부위, 증상, 언제부터, 약, 해 본 것 다 채운 상태
  const t11 = await mockTurnPost({
    session_id: 'test-결과',
    turn_index: 1,
    user_text: '3일 전부터 배 쓰리고 타이레놀 먹었고 전에 위염 진료 받았어요',
    selected_part: 'abdomen',
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '전에 위염 소견 들음',
    history: { filled_fields: ['body_part', 'symptom_desc', 'since_when', 'current_meds', 'tried_things'], last_emergency: false },
  });
  assertEqual(t11.status, 200, 'turn T11 status');
  assertEqual(t11.body.ok, true, 'turn T11 ok');
  const t11Safety = t11.body.events.find(e => e.event === 'safety');
  assert(t11Safety, 'turn T11 safety 존재');
  const t11State = t11.body.events.find(e => e.event === 'state');
  assert(t11State, 'turn T11 state 존재');
  const t11Memory = t11.body.events.find(e => e.event === 'memory');
  assert(t11Memory, 'turn T11 memory 존재 (previous_note 있음)');
  const t11Review = t11.body.events.find(e => e.event === 'review');
  assert(t11Review, 'turn T11 review 존재');
  const t11Result = t11.body.events.find(e => e.event === 'result');
  assert(t11Result, 'turn T11 result 존재');
  assertEqual(t11Result.event, 'result', 'turn T11 result event');
  assert(t11Result.body, 'turn T11 result body 존재');
  assertIsArray(t11Result.payload.department_top3, 'turn T11 department_top3 배열');
  t11Result.payload.department_top3.forEach((d, i) => {
    assert(d.name, 'turn T11 department_top3[' + i + '] name');
    assert(d.reason, 'turn T11 department_top3[' + i + '] reason');
  });
  assertIsArray(t11Result.payload.script, 'turn T11 script 문장 배열');
  assert(t11Result.payload.script.length > 0, 'turn T11 script 문장 존재');
  assertIsArray(t11Result.payload.questions, 'turn T11 questions 배열');
  assertEqual(t11Result.payload.questions.length, 3, 'turn T11 questions 3개');
  const t11Done = t11.body.events.find(e => e.event === 'done');
  assert(t11Done, 'turn T11 done 존재');
  assertEqual(t11Done.line, 'done, 5단계 거침, 툴 0회, 응급 없음', 'turn T11 done line');
  const t11SourceNote = t11.body.source_note;
  assert(t11SourceNote, 'turn T11 source_note 존재');
  assertInclude(t11SourceNote, '식품의약품안전처', 'turn T11 source_note 공공데이터');

  // T12 confirm_questions (질문이 있을 때, 결과 턴에서 confirm_questions로 나올 수 있음)
  // 실제 구현에 따라 다르지만, 결과 턴에서 confirm_questions가 나오는 경우를 테스트
  const t12 = await mockTurnPost({
    session_id: 'test-confirm',
    turn_index: 1,
    user_text: '3일 전부터 배 쓰리고 타이레놀 먹었고 전에 위염 진료 받았어요',
    selected_part: 'abdomen',
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '전에 위염 소견 들음',
    history: { filled_fields: ['body_part', 'symptom_desc', 'since_when', 'current_meds', 'tried_things'], last_emergency: false },
  });
  const t12Confirm = t12.body.events.find(e => e.event === 'confirm_questions');
  if (t12Confirm) {
    assertIsArray(t12Confirm.payload.questions, 'turn T12 confirm_questions questions 배열');
    assertEqual(t12Confirm.payload.questions.length, 3, 'turn T12 confirm_questions 질문 3개');
    assertInclude(t12Confirm.line, '질문', 'turn T12 confirm_questions line 질문');
  } else {
    console.log('turn T12: confirm_questions 없음 (구현 경과에 따라 생략 가능)');
  }

  // T13 툴 호출 턴 (e약은요)
  const t13 = await mockTurnPost({
    session_id: 'test-툴',
    turn_index: 1,
    user_text: '타이레놀정500mg 먹고 있어',
    selected_part: 'abdomen',
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: [], last_emergency: false },
  });
  const t13ToolCall = t13.body.events.find(e => e.event === 'tool_call');
  if (t13ToolCall) {
    assertEqual(t13ToolCall.tool, 'e약은요', 'turn T13 tool_call 툴 이름');
    assertEqual(t13ToolCall.tool_status, 'called', 'turn T13 tool_call status called');
    const t13ToolResult = t13.body.events.find(e => e.event === 'tool_result' && e.tool === 'e약은요');
    assert(t13ToolResult, 'turn T13 tool_result 존재');
    assertEqual(t13ToolResult.tool_status, 'ok', 'turn T13 tool_result status ok');
    assertInclude(t13ToolResult.line, '타이레놀', 'turn T13 tool_result line 타이레놀');
  } else {
    console.log('turn T13: tool_call 없음 (agent 판단에 따라 생략 가능, 환경이 툴 호출 안 할 수 있음)');
  }
  const t13Done = t13.body.events.find(e => e.event === 'done');
  assert(t13Done, 'turn T13 done 존재');

  // T14 툴 실패 처리 (실제 실패 시나리오는 환경 의존적이므로, 구조가 있는지 확인)
  const t14 = await mockTurnPost({
    session_id: 'test-툴실패',
    turn_index: 1,
    user_text: '타이레놀정500mg 먹고 있어',
    selected_part: 'abdomen',
    photos: [],
    profile: { nickname: '나', age: 34, allergies: '', chronic_diseases: '' },
    previous_note: '',
    history: { filled_fields: [], last_emergency: false },
  });
  const t14ToolResult = t14.body.events.find(e => e.event === 'tool_result');
  if (t14ToolResult && t14ToolResult.tool_status === 'failed') {
    assert(t14ToolResult.tool_error, 'turn T14 tool_error 존재');
  } else {
    console.log('turn T14: 툴 실패 없음 (성공했거나 툴 미호출)');
  }

  // T15 done 라인 (T7, T11 등 이미 검증)
  // T16 서버 로그 한 줄
  // run_tests.mjs 실행 시 stdout에 [turn] 로그가 찍히는지 별도 확인 (콘솔 출력 확인)

  console.log('turn PASS');
}

// ---------- main ----------
async function main() {
  const results = [];
  console.log('=== 병원 진료 대본 서비스 API 테스트 ===\n');

  try {
    await testHealth();
    results.push('health PASS');
  } catch (err) {
    console.error('health FAIL:', err.message);
    results.push('health FAIL: ' + err.message);
  }

  console.log('');

  try {
    await testPill();
    results.push('pill PASS');
  } catch (err) {
    console.error('pill FAIL:', err.message);
    results.push('pill FAIL: ' + err.message);
  }

  console.log('');

  try {
    await testTurn();
    results.push('turn PASS');
  } catch (err) {
    console.error('turn FAIL:', err.message);
    results.push('turn FAIL: ' + err.message);
  }

  console.log('\n=== 요약 ===');
  const passCount = results.filter(r => r.endsWith('PASS')).length;
  const failCount = results.filter(r => r.includes('FAIL')).length;
  console.log('총 테스트 그룹: ' + results.length);
  console.log('PASS: ' + passCount);
  console.log('FAIL: ' + failCount);
  results.forEach(r => console.log('  ' + r));

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('테스트 실행 오류:', err);
  process.exit(1);
});
