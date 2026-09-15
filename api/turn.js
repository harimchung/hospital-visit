// api/turn.js — POST /api/turn (패키지 없이, 내장 fetch)
// env: UPSTAGE_API_KEY, DATA_API_KEY
// system prompt: repo 루트의 SKILL.md를 런타임에 읽어서 그대로 사용.
// 실패 시 최소 안전 프롬프트로 fallback.

import { readFileSync } from 'node:fs';
import { checkEmergency } from './_lib/emergency.js';
import { summarizeState, STATE_FIELDS } from './_lib/state.js';
import { chatCompletion, extractToolCall } from './_lib/solar.js';
import { TOOL_DEFS, TOOL_MAP } from './_lib/tools.js';
import { getDepartmentTop3 } from './_lib/departments.js';

// SKILL.md 경로: 이 파일(api/turn.js)이 api/ 아래에 있으므로, repo 루트까지 두 단계 위로 올라간다.
const SKILL_PATH = new URL('../../SKILL.md', import.meta.url).pathname;

// 프론트 부위 표시용 단어를 내부 ID로 매핑(코드 기반 보정용).
const FRONT_PART_DISPLAY_MAP = {
  머리: 'head',
  두통: 'head',
  머리통증: 'head',
  눈: 'eye',
  귀: 'ear',
  목: 'neck',
  코: 'nose',
  가슴: 'chest',
  명치: 'chest',
  배: 'abdomen',
  복부: 'abdomen',
  허리: 'waist',
  등: 'back_joint',
  무릎: 'knee',
  피부: 'skin',
  팔: 'other',
  다리: 'other',
};

const FRONTEND_PART_INTERNAL_MAP = {
  ear: 'face_neck',
  neck: 'face_neck',
  nose: 'face_neck',
  waist: 'back_joint',
  knee: 'back_joint',
};

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    session_id, turn_index, user_text, selected_part, photos,
    profile, previous_note, history,
  } = body;

  // 1) 안전 검사(가장 먼저, 코드 기반)
  const emerCheck = checkEmergency(user_text);
  const events = [];

  if (emerCheck.emergency) {
    events.push({
      event: 'safety',
      line: `안전 신호 확인, 10개 대조, ${emerCheck.emergency.signal} 걸렸음`,
      body: `응급 신호: ${emerCheck.emergency.cond}`,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {
        signal: emerCheck.emergency.signal,
        cond: emerCheck.emergency.cond,
      },
    });
    events.push({
      event: 'done',
      line: 'done, 응급으로 종료',
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    });

    const logLine = `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=0 emergency=true`;
    console.log(logLine);

    return new Response(
      JSON.stringify({
        ok: true,
        turn_index: turn_index + 1,
        events,
        state: {
          body_part: selected_part || null,
          symptom_desc: null,
          since_when: null,
          current_meds: [],
          tried_things: [],
        },
        source_note: null,
      }, null, 2),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 2) 안전 통과 → state 구성 (요청에 실린 이전 state + 비어 있는 칸만 기본값)
  const state = buildState(body);
  const sum = summarizeState(state);

  // state 이벤트: 실제로 찬 것만
  const filledDesc = sum.filled.map((f) => {
    const v = state[f];
    if (Array.isArray(v)) {
      return v.length ? `${f} ${v.join(', ')}` : null;
    }
    return v ? `${f} ${v}` : null;
  }).filter(Boolean);
  const nextDesc = sum.next ? `다음: ${sum.next}` : '없음';

  events.push({
    event: 'state',
    line: filledDesc.length ? `읽은 칸: ${filledDesc.join(', ')}` : '읽은 칸 없음',
    body: null,
    hint: nextDesc !== '없음' ? `채울 칸: ${nextDesc}` : null,
    tool: null,
    tool_status: null,
    tool_error: null,
    payload: {
      filled_fields: sum.filled,
      next_field: sum.next,
    },
  });

  // 3) memory (이전 진료 메모 있으면)
  if (previous_note && previous_note.trim().length > 0) {
    events.push({
      event: 'memory',
      line: `참고 기록: 지난 진료 메모 "${previous_note.slice(0, 40)}..."`,
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    });
  }

  // 4) Solar 호출(agent 진행)
  const messages = buildAgentMessages(body, state);
  let toolCallCount = 0;
  let choice;
  let lastChoices = [];

  try {
    choice = await chatCompletion(messages, TOOL_DEFS, 'auto');
  } catch (err) {
    // Solar 실패 → 현재 정보로 result(규칙 조립 fallback)
    events.push({
      event: 'review',
      line: 'Solar 호출 실패: ' + (err && err.message ? err.message : String(err)),
      body: '현재 대화 내용을 바탕으로 대본을 만들었어요.',
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    });
    const final = buildFallbackResult(body, state, [{ name: '내과', reason: '기본 추천' }]);
    events.push({
      event: 'result',
      line: '대본·질문 3개·진료과 1~3위 정리 완료',
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: final,
    });
    events.push(done(3, 0, false));
    const logLine = `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=0 emergency=false`;
    console.log(logLine);
    return jsonResponse(turn_index + 1, events, state, null);
  }

  lastChoices = [choice];

  // 5) 도구 호출 루프(최대 8회)
  let toolCall = extractToolCall(choice);
  let toolRound = 0;
  while (toolCall && toolRound < 8) {
    toolCallCount++;
    toolRound++;
    const fnName = toolCall?.function?.name;
    const args = toolCall?.function?.arguments || {};

    events.push({
      event: 'tool_call',
      line: `${fnName} 호출 중...`,
      body: null,
      hint: null,
      tool: fnName,
      tool_status: 'called',
      tool_error: null,
      payload: {},
    });

    let toolRes;
    try {
      toolRes = await TOOL_MAP[fnName](args);
    } catch (err) {
      toolRes = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    events.push({
      event: 'tool_result',
      line: toolRes?.ok
        ? `${fnName}: 결과 있음 (${JSON.stringify(toolRes.result || toolRes).slice(0, 60)})`
        : `${fnName}: 호출 실패 - ${toolRes?.error || '알 수 없음'}`,
      body: null,
      hint: null,
      tool: fnName,
      tool_status: toolRes?.ok ? 'ok' : 'failed',
      tool_error: toolRes?.ok ? null : (toolRes?.error || '실패'),
      payload: toolRes,
    });

    const toolMsg = {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolRes),
    };
    messages.push(toolMsg);

    try {
      choice = await chatCompletion(messages, TOOL_DEFS, 'auto');
      lastChoices = [...lastChoices, choice];
    } catch {
      // 재호출 실패 → fallback
      break;
    }
    toolCall = extractToolCall(choice);
  }

  // 6) 결과 구성: Solar 응답을 우선 JSON으로 파싱
  const parsed = parseSolarReply(choice);

  if (parsed) {
    // 모델 state를 기존 state에 덮어쓰기(모델이 비운 칸은 기존 값 유지)
    const mergedState = mergeState(state, parsed.state);
    const sum2 = summarizeState(mergedState);
    const allFilled = sum2.filled.length === STATE_FIELDS.length;

    if (allFilled) {
      // 다 찼으면 result: 스크립트·질문은 모델 문장, 진료과는 규칙표
      const depts = getDepartmentTop3(mergedState.body_part);
      const script = Array.isArray(parsed.script) && parsed.script.length > 0
        ? parsed.script
        : buildFallbackScript(mergedState);
      const questions = Array.isArray(parsed.questions) && parsed.questions.length > 0
        ? parsed.questions.slice(0, 3)
        : buildFallbackQuestions(mergedState);

      events.push({
        event: 'result',
        line: '대본·질문 3개·진료과 1~3위 정리 완료',
        body: null,
        hint: null,
        tool: null,
        tool_status: null,
        tool_error: null,
        payload: {
          department_top3: depts.map((d) => ({ name: d.name, reason: d.reason })),
          script,
          questions,
          photos: (body.photos || []).map((p) => ({ label: p.label, caption: p.caption })),
          note_placeholder: '의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요',
        },
      });

      events.push(done(toolRound + 2, toolCallCount, false));
      const logLine = `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=${toolCallCount} emergency=false`;
      console.log(logLine);
      return jsonResponse(turn_index + 1, events, mergedState, null);
    } else {
      // 빈 칸이 남았으면 ask
      const nextField = parsed.next_field || sum2.next;
      const question = parsed.question || `${nextField}를 알려주세요.`;
      const chips = buildChips(parsed.chips, nextField);
      const bodyText = parsed.emergency_suspected
        ? '증상 설명을 더 자세히 해 주실 수 있나요? 응급 상황인지 확인이 필요해요.'
        : question;

      events.push({
        event: 'ask',
        line: `질문: ${bodyText}`,
        body: bodyText,
        hint: sum2.filled.length ? `채운 칸: ${sum2.filled.join(', ')}` : null,
        tool: null,
        tool_status: null,
        tool_error: null,
        payload: {
          next_question: bodyText,
          filled_fields: sum2.filled,
          next_field: nextField,
          chips,
        },
      });

      events.push(done(toolRound + 2, toolCallCount, false));
      const logLine = `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=${toolCallCount} emergency=false`;
      console.log(logLine);
      return jsonResponse(turn_index + 1, events, mergedState, null);
    }
  } else {
    // 파싱 실패 → review + 규칙 조립 fallback
    events.push({
      event: 'review',
      line: '모델 답 해석 실패, 규칙 조립',
      body: '현재 대화 내용을 바탕으로 대본을 만들었어요.',
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    });
    const finalResult = buildFallbackResult(body, state, []);
    events.push({
      event: 'result',
      line: '대본·질문 3개·진료과 1~3위 정리 완료',
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: finalResult,
    });

    events.push(done(toolRound + 2, toolCallCount, false));
    const logLine = `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=${toolCallCount} emergency=false`;
    console.log(logLine);
    return jsonResponse(turn_index + 1, events, state, null);
  }
}

// --- 헬퍼 ---

// 요청에 실린 이전 state를 기본으로 깔고, 비어 있는 칸만 기본값 채움.
// 프론트가 state를 안 보내면(body.state 없음) 빈 state에서 시작하고,
// history.filled_fields로 "이전에 채워진 칸" 여부만 참고한다.
function buildState(body) {
  const { selected_part, user_text, previous_note } = body;
  const history = body.history || {};
  const filled = Array.isArray(history.filled_fields) ? history.filled_fields : [];
  const prev = body.state || null;

  // 이전 state가 있으면 그걸 기본으로
  const base = prev
    ? {
        body_part: prev.body_part ?? null,
        symptom_desc: prev.symptom_desc ?? null,
        since_when: prev.since_when ?? null,
        current_meds: Array.isArray(prev.current_meds) ? prev.current_meds : [],
        tried_things: Array.isArray(prev.tried_things) ? prev.tried_things : [],
      }
    : {
        body_part: null,
        symptom_desc: null,
        since_when: null,
        current_meds: [],
        tried_things: [],
      };

  // selected_part(프론트 부위 선택)가 있고 body_part가 비어 있으면 그걸로
  if (selected_part && !base.body_part) {
    base.body_part = selected_part;
  }

  // 비어 있는 칸만 정규식 extract로 기본값
  if (!base.body_part && !filled.includes('body_part')) {
    base.body_part = extractBodyPart(user_text);
  }
  if (!base.symptom_desc && !filled.includes('symptom_desc')) {
    base.symptom_desc = extractSymptom(user_text);
  }
  if (!base.since_when && !filled.includes('since_when')) {
    base.since_when = extractWhen(user_text);
  }
  if (!base.current_meds.length && !filled.includes('current_meds')) {
    base.current_meds = extractMeds(user_text);
  }
  if (!base.tried_things.length && !filled.includes('tried_things')) {
    base.tried_things = extractTried(user_text, previous_note);
  }

  return base;
}

// 사용자 발화에서 부위 표시용 단어를 뽑아 내부 ID로 매핑
function extractBodyPart(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [word, id] of Object.entries(FRONT_PART_DISPLAY_MAP)) {
    if (lower.includes(word)) {
      // 프론트 ID가 internal로 한 번 더 매핑될 수 있음(예: waist→back_joint)
      return FRONTEND_PART_INTERNAL_MAP[id] || id;
    }
  }
  return null;
}

// 모델 state를 기존 state에 병합: 모델이 채운 값은 덮어쓰고, 비운 칸은 기존 유지.
// body_part는 내부 ID로 보정.
function mergeState(existing, modelState) {
  if (!modelState || typeof modelState !== 'object') return existing;

  const merged = { ...existing };
  for (const key of STATE_FIELDS) {
    const mv = modelState[key];
    if (mv === undefined || mv === null || mv === '') {
      // 모델이 이 칸을 비움 → 기존 값 유지
      continue;
    }
    if (Array.isArray(mv)) {
      merged[key] = mv.length > 0 ? mv : existing[key] || [];
    } else {
      merged[key] = mv;
    }
  }

  // body_part 내부 ID 보정
  if (merged.body_part) {
    merged.body_part = normalizeBodyPart(merged.body_part);
  }

  return merged;
}

function normalizeBodyPart(val) {
  if (typeof val !== 'string') return val;
  // 이미 internal ID면 그대로
  if (FRONT_PART_DISPLAY_MAP[val]) {
    const mapped = FRONT_PART_DISPLAY_MAP[val];
    return FRONTEND_PART_INTERNAL_MAP[mapped] || mapped;
  }
  // 프론트 ID가 internal로 매핑되는 경우
  if (FRONTEND_PART_INTERNAL_MAP[val]) {
    return FRONTEND_PART_INTERNAL_MAP[val];
  }
  return val;
}

// user 메시지: SKILL.md(system) + 5칸 정리·프로필·지난 메모·방금 발화 + 응답 형식 절 언급
function buildAgentMessages(body, state) {
  const profile = body.profile || {};
  const parts = [
    { role: 'system', content: SKILL_CONTENT },
    {
      role: 'user',
      content: [
        `[현재까지 정리된 5칸]\
부위: ${state.body_part || '미정'}\
증상: ${state.symptom_desc || '미정'}\
언제부터: ${state.since_when || '미정'}\
복용 약: ${state.current_meds.length ? state.current_meds.join(', ') : '없음'}\
이미 해본 것: ${state.tried_things.length ? state.tried_things.join(', ') : '없음'}\
`,
        `[프로필] ${profile.nickname ? '별칭 ' + profile.nickname : '없음'}${profile.age != null ? ', 나이 ' + profile.age : ''}${profile.allergies ? ', 알레르기 ' + profile.allergies : ''}${profile.chronic_diseases ? ', 기저질환 ' + profile.chronic_diseases : ''}`,
        `[지난 진료 메모] ${body.previous_note ? body.previous_note : '없음'}`,
        `[지난 메모의 채워진 칸] ${body.history && Array.isArray(body.history.filled_fields) ? body.history.filled_fields.join(', ') || '없음' : '없음'}${body.history && body.history.last_emergency ? ', 이전 턴 응급: 예' : ''}`,
        `[방금 한 말] "${body.user_text}"`,
        ``,
        `위 정보를 바탕으로 SKILL.md의 '응답 형식' 절에 적힌 JSON 객체 하나만 출력하세요. 그 외 텍스트는 쓰지 마세요.`,
      ].join('\n'),
    },
  ];
  return parts;
}

// SKILL.md 내용이 바로 system prompt가 된다. 읽기 실패 시 최소 안전 프롬프트로 fallback.
const FALLBACK_SYSTEM_PROMPT = `당신은 병원 진료 대본 서비스입니다.
사용자의 증상을 바탕으로 진료 전에 의사에게 말할 수 있는 대본을 만듭니다.
진단이나 처방을 하지 않습니다.
응답은 반드시 한국어로, 친절하고 명확하게 작성하세요.
사용자의 발화에서 이미 제공된 정보는 다시 묻지 않습니다.
필요한 정보만 선별하여 질문합니다.`;

let SKILL_CONTENT;
try {
  SKILL_CONTENT = readFileSync(SKILL_PATH, 'utf8').trim();
} catch (err) {
  console.error('[turn] SKILL.md 읽기 실패:', err.message);
  SKILL_CONTENT = FALLBACK_SYSTEM_PROMPT;
}

// ---------- Solar 응답 파싱 ----------

/**
 * Solar choice에서 content(JSON)를 파싱한다.
 * 성공 시 { state, next_field, question, chips, emergency_suspected, script, questions },
 * 실패 시 null.
 */
export function parseSolarReply(choice) {
  const msg = choice?.message;
  if (!msg) return null;

  let content = null;

  // content가 문자열이면 그대로
  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    // 마크다운 블록이 여러 개면 첫 JSON 블록 찾기
    for (const block of msg.content) {
      if (typeof block === 'string' && block.trim()) {
        content = block;
        break;
      }
      if (typeof block === 'object' && block?.text) {
        content = block.text;
        break;
      }
    }
  }

  if (!content || typeof content !== 'string') return null;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  // state 확인
  const modelState = parsed.state;
  if (!modelState || typeof modelState !== 'object' || Array.isArray(modelState)) return null;
  for (const k of Object.keys(modelState)) {
    if (!STATE_FIELDS.includes(k)) return null;
    const v = modelState[k];
    if (v !== null && v !== undefined && v !== '') {
      if (Array.isArray(v)) {
        if (!Array.isArray(v)) return null;
        if (!v.every((x) => typeof x === 'string')) return null;
      } else if (typeof v !== 'string') {
        return null;
      }
    }
  }

  // next_field 확인
  if (parsed.next_field !== undefined && parsed.next_field !== null) {
    if (!STATE_FIELDS.includes(parsed.next_field)) return null;
  }

  // question 확인
  if (parsed.question !== undefined && typeof parsed.question !== 'string') return null;

  // chips 확인
  if (parsed.chips !== undefined) {
    if (!Array.isArray(parsed.chips)) return null;
    for (const chip of parsed.chips) {
      if (!chip || typeof chip !== 'object') return null;
      if (!chip.id || typeof chip.id !== 'string') return null;
      if (!chip.label || typeof chip.label !== 'string') return null;
      if (chip.isEscape !== undefined && typeof chip.isEscape !== 'boolean') return null;
      if (chip.isBodyPart !== undefined && typeof chip.isBodyPart !== 'boolean') return null;
    }
  }

  // emergency_suspected 확인
  if (parsed.emergency_suspected !== undefined && typeof parsed.emergency_suspected !== 'boolean') return null;

  // script 확인
  if (parsed.script !== undefined) {
    if (!Array.isArray(parsed.script) || !parsed.script.every((s) => typeof s === 'string')) return null;
  }

  // questions 확인
  if (parsed.questions !== undefined) {
    if (!Array.isArray(parsed.questions) || !parsed.questions.every((q) => typeof q === 'string')) return null;
  }

  return {
    state: modelState,
    next_field: parsed.next_field,
    question: parsed.question,
    chips: parsed.chips,
    emergency_suspected: parsed.emergency_suspected || false,
    script: parsed.script,
    questions: parsed.questions,
  };
}

// ---------- 칩 조립 ----------

function buildChips(modelChips, nextField) {
  if (!Array.isArray(modelChips) || modelChips.length === 0) {
    return defaultChips(nextField);
  }

  // 모델 칩 그대로 쓰되, 마지막이 isEscape가 아니면 탈출 칩 추가
  const out = modelChips.map((c, i) => ({
    id: c.id,
    label: c.label,
    isEscape: c.isEscape || false,
    isBodyPart: nextField === 'body_part' ? (c.isBodyPart !== false) : (c.isBodyPart || false),
  }));

  if (out.length === 0 || !out[out.length - 1].isEscape) {
    out.push({ id: 'escape', label: '잘 모르겠어', isEscape: true, isBodyPart: false });
  }

  // 4~6개 범위로 보정
  if (out.length < 4) {
    const defs = defaultChips(nextField).filter(
      (d) => d.id !== 'escape' && !out.some((o) => o.id === d.id)
    );
    while (out.length < 5 && defs.length) {
      out.splice(out.length - 1, 0, defs.shift());
    }
  }
  if (out.length > 6) {
    out.splice(5); // 탈출 칩은 유지
    if (!out[out.length - 1].isEscape) {
      out.push({ id: 'escape', label: '잘 모르겠어', isEscape: true, isBodyPart: false });
    }
  }

  return out;
}

function defaultChips(nextField) {
  if (nextField === 'body_part') {
    return [
      { id: 'head', label: '머리', isBodyPart: true },
      { id: 'eye', label: '눈', isBodyPart: true },
      { id: 'chest', label: '가슴', isBodyPart: true },
      { id: 'abdomen', label: '배', isBodyPart: true },
      { id: 'skin', label: '피부', isBodyPart: true },
      { id: 'escape', label: '잘 모르겠어', isEscape: true, isBodyPart: false },
    ];
  }
  if (nextField === 'symptom_desc') {
    return [
      { id: '통증', label: '아파요', isBodyPart: false },
      { id: '쓰림', label: '쓰려요', isBodyPart: false },
      { id: '가려움', label: '가려워요', isBodyPart: false },
      { id: '이상감각', label: '이상한 느낌이 들어요', isBodyPart: false },
      { id: 'escape', label: '잘 모르겠어', isEscape: true, isBodyPart: false },
    ];
  }
  if (nextField === 'since_when') {
    return [
      { id: '오늘', label: '오늘', isBodyPart: false },
      { id: '3일전', label: '3일 전쯤', isBodyPart: false },
      { id: '1주전', label: '1주 전쯤', isBodyPart: false },
      { id: '한달전', label: '한 달 전쯤', isBodyPart: false },
      { id: 'escape', label: '잘 모르겠어', isEscape: true, isBodyPart: false },
    ];
  }
  if (nextField === 'current_meds') {
    return [
      { id: '타이레놀', label: '타이레놀', isBodyPart: false },
      { id: '진통제', label: '진통제', isBodyPart: false },
      { id: '다른약', label: '다른 약', isBodyPart: false },
      { id: '없음', label: '먹는 약 없어요', isBodyPart: false },
      { id: 'escape', label: '잘 모르겠어', isEscape: true, isBodyPart: false },
    ];
  }
  if (nextField === 'tried_things') {
    return [
      { id: '약국', label: '약국에서 약 사 먹음', isBodyPart: false },
      { id: '진료', label: '병원 진료 받았음', isBodyPart: false },
      { id: '검사', label: '검사 받았음', isBodyPart: false },
      { id: '없음', label: '아직 아무것도 안 함', isBodyPart: false },
      { id: 'escape', label: '잘 모르겠어', isEscape: true, isBodyPart: false },
    ];
  }
  // 기본
  return [
    { id: 'option1', label: '선택 1', isBodyPart: false },
    { id: 'option2', label: '선택 2', isBodyPart: false },
    { id: 'option3', label: '선택 3', isBodyPart: false },
    { id: 'option4', label: '선택 4', isBodyPart: false },
    { id: 'escape', label: '잘 모르겠어', isEscape: true, isBodyPart: false },
  ];
}

// ---------- fallback 결과(모델 JSON 파싱 실패 시에만 사용) ----------

function buildFallbackResult(body, state, deptOverride) {
  const depts = deptOverride.length > 0 ? deptOverride : getDepartmentTop3(state.body_part);
  return {
    department_top3: depts.map((d) => ({ name: d.name, reason: d.reason })),
    script: buildFallbackScript(state),
    questions: buildFallbackQuestions(state),
    photos: (body.photos || []).map((p) => ({ label: p.label, caption: p.caption })),
    note_placeholder: '의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요',
  };
}

function buildFallbackScript(state) {
  const parts = [];
  if (state.body_part) parts.push(`${state.body_part}가 아파요.`);
  if (state.symptom_desc) parts.push(`증상은 "${state.symptom_desc}"예요.`);
  if (state.since_when) parts.push(`${state.since_when}부터 시작됐어요.`);
  if (state.current_meds.length > 0) parts.push(`${state.current_meds.join(', ')}를 먹고 있어요.`);
  if (state.tried_things.length > 0) parts.push(`${state.tried_things.join(', ')} 해봤어요.`);
  return parts.length > 0 ? parts : ['아직 정보가 부족해요. 더 알려주세요.'];
}

function buildFallbackQuestions(state) {
  const qs = [];
  if (state.current_meds.length > 0) qs.push('이 약 계속 먹어도 되나요?');
  if (state.tried_things.length > 0) qs.push(`${state.tried_things.join(' ')}했는데 효과가 없어요. 다른 방법이 있나요?`);
  qs.push('검사가 필요한가요?');
  return qs.slice(0, 3);
}

// ---------- 기존 extract 함수들(기본적으로 비어 있는 칸만 채움) ----------

function extractSymptom(text) {
  if (/아프|통증|쓰림|가려움|두드러기|발진|열|기침|콧물|설사|변비|메스꺼움|구토|두통|어지러움|숨차|가슴통증|복통|관절통/i.test(text)) {
    return text.match(/(아프|통증|쓰림|가려움|두드러기|발진|열|기침|콧물|설사|변비|메스꺼움|구토|두통|어지러움|숨차|가슴통증|복통|관절통)/i)?.[0] || '통증';
  }
  return null;
}

function extractWhen(text) {
  const when = text.match(/(\d+일\s*전|\d+주\s*전|\d+개월\s*전|\d+시간\s*전|어제|그제|오늘|며칠\s*전|1주일\s*전|2주일\s*전|3주일\s*전|한\s*달\s*전|두\s*달\s*전)/i);
  return when ? when[0] : null;
}

function extractMeds(text) {
  const meds = [];
  const medPattern = /타이레놀|아스피린|게보린|부루펜|이지엔6|펜잘|판피린|감기약|진통제|소염제|항생제와\s*\w+/gi;
  let match;
  while ((match = medPattern.exec(text)) !== null) {
    meds.push(match[0].trim());
  }
  return meds;
}

function extractTried(text, previousNote) {
  const tried = [];
  if (/진료\s*받았어|병원\s*갔어|약\s*먹었어|검사\s*받았어/i.test(text)) {
    tried.push('진료/약국 방문');
  }
  if (previousNote) tried.push(previousNote);
  return tried;
}

// ---------- 이벤트 헬퍼 ----------

function done(steps, tools, emergency) {
  return {
    event: 'done',
    line: emergency
      ? 'done, 응급으로 종료'
      : `done, ${steps}단계, 툴 ${tools}회, 응급 없음`,
    body: null,
    hint: null,
    tool: null,
    tool_status: null,
    tool_error: null,
    payload: {},
  };
}

function jsonResponse(turn_index, events, state, source_note) {
  return new Response(
    JSON.stringify({
      ok: true,
      turn_index,
      events,
      state,
      source_note,
    }, null, 2),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
