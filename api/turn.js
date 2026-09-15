// api/turn.js — POST /api/turn (패키지 없이, 내장 fetch)
// env: UPSTAGE_API_KEY, DATA_API_KEY
// system prompt: repo 루트의 SKILL.md를 런타임에 읽어서 그대로 사용.
// 실패 시 최소 안전 프롬프트로 fallback.

import { readFileSync } from 'node:fs';
import { checkEmergency } from './_lib/emergency.js';
import { summarizeState } from './_lib/state.js';
import { chatCompletion, extractToolCall, TOOL_DEFS, TOOL_MAP } from './_lib/solar.js';
import { getDepartmentTop3 } from './_lib/departments.js';

// SKILL.md 경로: 이 파일(api/turn.js)이 api/ 아래에 있으므로, repo 루트까지 두 단계 위로 올라간다.
const SKILL_PATH = new URL('../../SKILL.md', import.meta.url).pathname;

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

  // 2) 안전 통과 → state 이벤트
  const state = buildState(body);
  const sum = summarizeState(state);
  events.push({
    event: 'state',
    line: `상태: ${sum.filled.map(f => f + '=' + (state[f] || '')).join(', ') || '없음'}`,
    body: null,
    hint: `채울 칸: ${sum.next || '없음'}`,
    tool: null,
    tool_status: null,
    tool_error: null,
    payload: { filled_fields: sum.filled, next_field: sum.next },
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

  try {
    choice = await chatCompletion(messages, TOOL_DEFS, 'auto');
  } catch (err) {
    // Solar 실패 → 현재 정보로 result
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
    const final = buildResult(body, state, [{ name: '내과', reason: '기본 추천' }]);
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
    } catch {
      // 재호출 실패 → fallback
      break;
    }
    toolCall = extractToolCall(choice);
  }

  // 6) 결과 구성
  const finalResult = buildResult(body, state, []);
  events.push({
    event: 'result',
    line: `대본·질문 3개·진료과 추천 정리 완료`,
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

// --- 헬퍼 ---

function buildState(body) {
  const history = body.history || {};
  const filled = history.filled_fields || [];
  const state = {
    body_part: (body.selected_part && filled.includes('body_part')) ? body.selected_part : null,
    symptom_desc: filled.includes('symptom_desc') ? extractSymptom(body.user_text) : null,
    since_when: filled.includes('since_when') ? extractWhen(body.user_text) : null,
    current_meds: filled.includes('current_meds') ? extractMeds(body.user_text) : [],
    tried_things: filled.includes('tried_things') ? extractTried(body.user_text, body.previous_note) : [],
  };
  return state;
}

function buildAgentMessages(body, state) {
  const profile = body.profile || {};
  const parts = [
    { role: 'system', content: SKILL_CONTENT },
    { role: 'user', content: `[부위] ${state.body_part || '미정'}\n[증상] ${state.symptom_desc || '미정'}\n[시기] ${state.since_when || '미정'}\n[복용약] ${state.current_meds.join(', ') || '없음'}\n[시도한 것] ${state.tried_things.join(', ') || '없음'}\n\n사용자 발화: "${body.user_text}"` },
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

function buildResult(body, state, deptOverride) {
  const depts = deptOverride.length > 0 ? deptOverride : getDepartmentTop3(state.body_part);
  const script = buildScript(state);
  const questions = buildQuestions(state);
  return {
    department_top3: depts.map(d => ({ name: d.name, reason: d.reason })),
    script: script,
    questions: questions,
    photos: (body.photos || []).map(p => ({ label: p.label, caption: p.caption })),
    note_placeholder: '의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요',
  };
}

function buildScript(state) {
  const parts = [];
  if (state.body_part) parts.push(`${state.body_part}가 아파요.`);
  if (state.symptom_desc) parts.push(`증상은 "${state.symptom_desc}"예요.`);
  if (state.since_when) parts.push(`${state.since_when}부터 시작됐어요.`);
  if (state.current_meds.length > 0) parts.push(`${state.current_meds.join(', ')}를 먹고 있어요.`);
  if (state.tried_things.length > 0) parts.push(`${state.tried_things.join(', ')} 해봤어요.`);
  return parts.length > 0 ? parts : ['아직 정보가 부족해요. 더 알려주세요.'];
}

function buildQuestions(state) {
  const qs = [];
  if (state.current_meds.length > 0) qs.push('이 약 계속 먹어도 되나요?');
  if (state.tried_things.length > 0) qs.push(`${state.tried_things.join(' ')}했는데 효과가 없어요. 다른 방법이 있나요?`);
  qs.push('검사가 필요한가요?');
  return qs.slice(0, 3);
}

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
  const medPattern = /타이레놀|아스피린|게보린|부루펜|이지엔6|펜잘|판피린| CloudWatch|감기약|진통제|소염제|항생제와\s*\w+/gi;
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
