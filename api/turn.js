// api/turn.js — POST /api/turn (패키지 없이, 내장 fetch)
// env: UPSTAGE_API_KEY, DATA_API_KEY
// system prompt: repo 루트의 SKILL.md를 런타임에 읽어서 그대로 사용.
// 실패 시 최소 안전 프롬프트로 fallback.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  checkEmergency,
  checkDistress,
  EMERGENCY_CONFIRM_CHIPS,
} from "./_lib/emergency.js";
import { summarizeState, STATE_FIELDS } from "./_lib/state.js";
import { chatCompletion, extractToolCall } from "./_lib/solar.js";
import { TOOL_DEFS, TOOL_MAP, TOOL_LABEL } from "./_lib/tools.js";
import { getDepartmentTop3 } from "./_lib/departments.js";

// SKILL.md 경로: api/turn.js 기준 한 단계 위가 repo 루트다.
const SKILL_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

// 프론트 부위 표시용 단어를 내부 ID로 매핑(코드 기반 보정용).
const FRONT_PART_DISPLAY_MAP = {
  머리: "head",
  두통: "head",
  머리통증: "head",
  눈: "eye",
  귀: "ear",
  목: "neck",
  코: "nose",
  가슴: "chest",
  명치: "chest",
  배: "abdomen",
  복부: "abdomen",
  허리: "waist",
  등: "back_joint",
  무릎: "knee",
  피부: "skin",
  팔: "other",
  다리: "other",
};

const FRONTEND_PART_INTERNAL_MAP = {
  ear: "face_neck",
  neck: "face_neck",
  nose: "face_neck",
  waist: "back_joint",
  knee: "back_joint",
};

// 화면·모델용 한글 라벨
const PART_LABEL_KO = {
  head: "머리",
  eye: "눈",
  ear: "귀",
  neck: "목",
  nose: "코",
  chest: "가슴",
  abdomen: "배",
  waist: "허리",
  knee: "무릎",
  skin: "피부",
  face_neck: "눈·귀·코·목",
  back_joint: "허리·관절",
  other: "그 외",
  multiple: "여러 군데",
};
const FIELD_LABEL = {
  body_part: "부위",
  symptom_desc: "증상",
  since_when: "언제부터",
  current_meds: "약",
  tried_things: "해 본 것",
  emergency_confirm: "응급 확인",
};

function isFilled(v) {
  return Array.isArray(v) ? v.length > 0 : !!v;
}

function partLabel(id) {
  return PART_LABEL_KO[id] || id || "미정";
}

function stateLine(state, filled) {
  const parts = filled.map((f) => {
    const v = state[f];
    const shown = Array.isArray(v)
      ? v.join("/")
      : f === "body_part"
        ? partLabel(v)
        : v;
    return `${FIELD_LABEL[f]} ${shown}`;
  });
  return `${filled.length}가지 읽음: ${parts.join(", ") || "없음"}`;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "JSON 파싱 실패" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const {
    session_id,
    turn_index,
    user_text,
    selected_part,
    photos,
    profile,
    previous_note,
    history,
  } = body;

  // 1) 안전 검사(가장 먼저, 코드 기반)
  const emerCheck = checkEmergency(user_text);
  const events = [];

  if (emerCheck.emergency) {
    events.push({
      event: "safety",
      line: `안전 신호 확인, 10개 대조, ${emerCheck.emergency.signal} 걸렸음`,
      body: `${emerCheck.emergency.signal} 신호가 보여요. 대본은 만들지 않아요. 지금 바로 119에 연락하세요.`,
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
      event: "done",
      line: "done, 응급으로 종료",
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
      JSON.stringify(
        {
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
        },
        null,
        2,
      ),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2) 안전 통과 → state 구성 (요청에 실린 이전 state + 비어 있는 칸만 기본값)
  const state = buildState(body);

  // 3) memory (이전 진료 메모 있으면)
  if (previous_note && previous_note.trim().length > 0) {
    events.push({
      event: "memory",
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
    const toolChoice = wantsPillFinder(user_text)
      ? { type: "function", function: { name: "pill_identify" } }
      : "auto";
    choice = await chatCompletion(messages, TOOL_DEFS, toolChoice);
  } catch (err) {
    // Solar 실패 → 현재 정보로 result(규칙 조립 fallback)
    events.push({
      event: "review",
      line:
        "Solar 호출 실패: " + (err && err.message ? err.message : String(err)),
      body: "현재 대화 내용을 바탕으로 대본을 만들었어요.",
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    });
    const final = buildFallbackResult(body, state, [
      { name: "내과", reason: "기본 추천" },
    ]);
    events.push({
      event: "result",
      line: "대본·질문 3개·진료과 1~3위 정리 완료",
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: final,
    });
    if (wantsPillFinder(user_text)) await runPillIdentifyTool(events);
    events.push(done(3, 0, false));
    const logLine = `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=0 emergency=false`;
    console.log(logLine);
    return jsonResponse(turn_index + 1, events, state, null);
  }

  // 5) 도구 호출 루프(최대 8회)
  const loop = { toolRound: 0, toolCallCount: 0 };
  choice = await runToolLoop(choice, messages, events, loop, user_text);
  if (wantsPillFinder(user_text)) await runPillIdentifyTool(events);
  toolCallCount = events.filter((e) => e.event === "tool_call").length;
  let toolRound = loop.toolRound;

  // 6) 모델 답 해석. 빈 칸이 남으면 ask, 다 찼으면 result. 해석 실패면 기본 칩으로 묻거나 규칙 조립
  const parsed = parseSolarReply(choice);
  const askedField =
    body.state && typeof body.state.asked_field === "string"
      ? body.state.asked_field
      : null;
  const mergedState = parsed
    ? mergeState(state, parsed.state, askedField, user_text)
    : { ...state };
  // 이번 발화가 다른 칸으로 읽혔으면 같은 문장을 물었던 칸에 또 넣지 않는다.
  // 칸을 건너뛴 다음 턴에 "복용한 약은 OO이에요" 같은 답이 해 본 것 칸에 박히는 걸 막는다
  const prevState = body.state || {};
  const readAsOtherField = STATE_FIELDS.some(
    (f) =>
      f !== askedField && !isFilled(prevState[f]) && isFilled(mergedState[f]),
  );
  fillAskedField(mergedState, askedField, user_text, readAsOtherField);
  const sum2 = summarizeState(mergedState);
  const allFilled = sum2.filled.length === STATE_FIELDS.length;

  events.push({
    event: "state",
    line: stateLine(mergedState, sum2.filled),
    body: null,
    hint: sum2.next ? `다음: ${FIELD_LABEL[sum2.next]}` : null,
    tool: null,
    tool_status: null,
    tool_error: null,
    payload: { filled_fields: sum2.filled, next_field: sum2.next },
  });

  // 응급 의심이면 다음 칸을 묻지 않고 확인 턴을 연다. 칩 문장은 코드 표에 걸리게 만들어 두었으니
  // 사용자가 칩을 누르면 다음 턴 첫 검사에서 코드가 119로 판정한다. 확인 턴은 연속 두 번 열지 않는다
  const suspicious =
    !!(parsed && parsed.emergency_suspected) || checkDistress(user_text);
  if (suspicious && askedField !== "emergency_confirm") {
    events.push({
      event: "review",
      line:
        parsed && parsed.emergency_suspected
          ? "응급 의심(모델), 확인 칩으로 감"
          : "응급 의심(강한 표현), 확인 칩으로 감",
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    });
    const question =
      "말씀을 들으니 응급일 수도 있어서 먼저 확인할게요. 지금 이런 상태에 해당하는 게 있나요?";
    mergedState.asked_field = "emergency_confirm";
    events.push({
      event: "ask",
      line: `질문: ${question}`,
      body: question,
      hint: "해당하면 눌러 주세요. 아니면 마지막 칩을 누르면 이어서 진행해요",
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {
        next_question: question,
        filled_fields: sum2.filled,
        next_field: null,
        chips: EMERGENCY_CONFIRM_CHIPS.map((c) => ({
          ...c,
          isEscape: c.isEscape === true,
          isBodyPart: false,
        })),
      },
    });
    events.push(done(toolRound + 2, toolCallCount, false));
    console.log(
      `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=${toolCallCount} emergency=false`,
    );
    return jsonResponse(turn_index + 1, events, mergedState, null);
  }

  if (!allFilled) {
    // 빈 칸이 남았으면 ask. 모델이 고른 칸을 존중하되, 직전에 물은 칸이 아직 비어 있으면
    // 그 칸을 건너뛰고 다른 빈 칸으로 넘긴다. 넘길 칸이 없으면 어쩔 수 없이 한 번 더 묻는다
    const stuckField =
      askedField &&
      STATE_FIELDS.includes(askedField) &&
      !isFilled(mergedState[askedField])
        ? askedField
        : null;
    const skipTo = stuckField
      ? STATE_FIELDS.find(
          (f) => f !== stuckField && !isFilled(mergedState[f]),
        ) || null
      : null;
    const modelRepeats = !!(
      parsed &&
      parsed.next_field &&
      parsed.next_field === stuckField
    );
    const useModel = !!(
      parsed &&
      parsed.next_field &&
      parsed.question &&
      !(modelRepeats && skipTo)
    );
    const nextField = useModel ? parsed.next_field : skipTo || sum2.next;
    let question = useModel
      ? parsed.question
      : `${FIELD_LABEL[nextField]}은 어떻게 돼요? 조금만 더 알려 주세요.`;
    if (stuckField) {
      events.push({
        event: "review",
        line:
          nextField === stuckField
            ? `${FIELD_LABEL[stuckField]} 칸이 비어 있지만 남은 빈 칸이 이것뿐, 한 번 더 물음`
            : `${FIELD_LABEL[stuckField]} 칸 재질문 피하고 ${FIELD_LABEL[nextField]}으로 넘김`,
        body: null,
        hint: null,
        tool: null,
        tool_status: null,
        tool_error: null,
        payload: {},
      });
    }
    if (!parsed) {
      events.push({
        event: "review",
        line: "모델 답 해석 실패, 기본 질문으로 진행",
        body: null,
        hint: null,
        tool: null,
        tool_status: null,
        tool_error: null,
        payload: {},
      });
    }
    const chips = buildChips(useModel ? parsed.chips : null, nextField);
    mergedState.asked_field = nextField;

    events.push({
      event: "ask",
      line: `질문: ${question}`,
      body: question,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {
        next_question: question,
        filled_fields: sum2.filled,
        next_field: nextField,
        chips,
      },
    });
    events.push(done(toolRound + 2, toolCallCount, false));
    console.log(
      `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=${toolCallCount} emergency=false`,
    );
    return jsonResponse(turn_index + 1, events, mergedState, null);
  }

  // 다 찼으면 result. 대본과 질문은 모델 문장. 이번 턴 답에 대본이 없으면 마무리 호출 한 번으로 받는다
  delete mergedState.asked_field;
  const depts = getDepartmentTop3(mergedState.body_part);
  let modelScript = parsed && parsed.script.length > 0 ? parsed.script : null;
  let modelQuestions =
    parsed && parsed.questions.length > 0 ? parsed.questions.slice(0, 3) : null;
  if (!modelScript || !modelQuestions || modelQuestions.length < 3) {
    try {
      const finalMessages = buildFinalMessages(body, mergedState);
      let finalChoice = await chatCompletion(finalMessages, TOOL_DEFS, "auto");
      finalChoice = await runToolLoop(finalChoice, finalMessages, events, loop, user_text);
      toolCallCount = loop.toolCallCount;
      toolRound = loop.toolRound;
      const finalParsed = parseSolarReply(finalChoice);
      if (finalParsed && finalParsed.script.length > 0)
        modelScript = finalParsed.script;
      if (finalParsed && finalParsed.questions.length >= 3)
        modelQuestions = finalParsed.questions.slice(0, 3);
      else if (
        finalParsed &&
        finalParsed.questions.length > 0 &&
        !modelQuestions
      )
        modelQuestions = finalParsed.questions;
      events.push({
        event: "review",
        line: finalParsed
          ? `마무리 호출, 대본 ${(modelScript || []).length}문장, 질문 ${(modelQuestions || []).length}개`
          : "마무리 호출 답 해석 실패, 규칙 조립",
        body: null,
        hint: null,
        tool: null,
        tool_status: null,
        tool_error: null,
        payload: {},
      });
    } catch (err) {
      events.push({
        event: "review",
        line:
          "마무리 호출 실패: " +
          (err && err.message ? err.message : String(err)),
        body: null,
        hint: null,
        tool: null,
        tool_status: null,
        tool_error: null,
        payload: {},
      });
    }
  } else {
    events.push({
      event: "review",
      line: `대본 ${modelScript.length}문장, 질문 ${modelQuestions.length}개 확인`,
      body: null,
      hint: null,
      tool: null,
      tool_status: null,
      tool_error: null,
      payload: {},
    });
  }
  events.push({
    event: "result",
    line: "대본·질문 3개·진료과 1~3위 정리 완료",
    body: null,
    hint: null,
    tool: null,
    tool_status: null,
    tool_error: null,
    payload: {
      department_top3: depts.map((d) => ({ name: d.name, reason: d.reason })),
      script: modelScript || buildFallbackScript(mergedState),
      questions: modelQuestions || buildFallbackQuestions(mergedState),
      photos: (body.photos || []).map((p) => ({
        label: p.label,
        caption: p.caption,
      })),
      note_placeholder: "의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요",
    },
  });
  events.push(done(toolRound + 3, toolCallCount, false));
  console.log(
    `[turn] session_id=${session_id} turn_index=${turn_index} events_count=${events.length} tools=${toolCallCount} emergency=false`,
  );
  return jsonResponse(turn_index + 1, events, mergedState, null);
}

// --- 헬퍼 ---

// 도구 호출 루프. 한 응답에 툴 호출이 여러 개면 전부 실행하고 결과를 각각 돌려준다. 최대 8라운드
async function runToolLoop(choice, messages, events, loop, userText) {
  while (loop.toolRound < 8) {
    const calls =
      Array.isArray(choice?.message?.tool_calls) &&
      choice.message.tool_calls.length > 0
        ? choice.message.tool_calls
        : extractToolCall(choice)
          ? [extractToolCall(choice)]
          : [];
    if (calls.length === 0) break;

    // tool 메시지 앞에는 그 호출을 낸 assistant 메시지가 있어야 한다
    if (choice.message?.tool_calls) messages.push(choice.message);
    else
      messages.push({
        role: "assistant",
        content: choice.message?.content || "",
      });

    for (const tc of calls) {
      loop.toolCallCount++;
      const fnName = tc?.function?.name;
      const label = TOOL_LABEL[fnName] || fnName;
      const rawArgs = tc?.function?.arguments;
      let args = {};
      if (typeof rawArgs === "string") {
        try {
          args = JSON.parse(rawArgs);
        } catch {
          args = {};
        }
      } else if (rawArgs && typeof rawArgs === "object") {
        args = rawArgs;
      }

      const skipPillIdentify =
        fnName === "pill_identify" && !wantsPillFinder(userText);

      if (!skipPillIdentify) {
        events.push({
          event: "tool_call",
          line: `${label} 호출`,
          body: null,
          hint: null,
          tool: fnName,
          tool_status: "called",
          tool_error: null,
          payload: { args },
        });
      }

      let toolRes;
      if (skipPillIdentify) {
        toolRes = {
          ok: true,
          result: {
            skipped: true,
            reason:
              "사용자가 약 이름 찾기를 요청하지 않음. pill_identify를 쓰지 말고 JSON만 출력해.",
          },
        };
      } else if (typeof TOOL_MAP[fnName] !== "function") {
        toolRes = { ok: false, error: `알 수 없는 툴: ${fnName}` };
      } else {
        try {
          toolRes = await TOOL_MAP[fnName](args);
        } catch (err) {
          toolRes = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      if (!skipPillIdentify) {
        events.push({
          event: "tool_result",
          line: toolRes?.ok
            ? fnName === "pill_identify"
              ? "낱알식별: 모양이랑 색으로 찾기 열기"
              : `${label}: ${JSON.stringify(toolRes.result || {}).slice(0, 80)}`
            : `${label}: 호출 실패, ${toolRes?.error || "알 수 없음"}`,
          body: null,
          hint: null,
          tool: fnName,
          tool_status: toolRes?.ok ? "ok" : "failed",
          tool_error: toolRes?.ok ? null : toolRes?.error || "실패",
          payload: toolRes,
        });
      }

      if (
        fnName === "pill_identify" &&
        toolRes?.ok &&
        !toolRes?.result?.skipped &&
        wantsPillFinder(userText)
      ) {
        emitOpenPillFinder(events, toolRes.result || {});
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id || `call_${loop.toolRound}_${loop.toolCallCount}`,
        content: JSON.stringify(toolRes),
      });
    }

    loop.toolRound++;
    try {
      choice = await chatCompletion(messages, TOOL_DEFS, "auto");
    } catch (err) {
      events.push({
        event: "review",
        line:
          "Solar 재호출 실패: " +
          (err && err.message ? err.message : String(err)),
        body: null,
        hint: null,
        tool: null,
        tool_status: null,
        tool_error: null,
        payload: {},
      });
      break;
    }
  }
  return choice;
}

// 5칸이 다 찼을 때 대본과 질문 3개만 받는 마무리 호출
function buildFinalMessages(body, state) {
  const profile = body.profile || {};
  const meds = state.current_meds.filter((m) => m !== "없음");
  return [
    { role: "system", content: SKILL_CONTENT },
    {
      role: "user",
      content: [
        "[정리된 5칸]",
        `부위: ${partLabel(state.body_part)}`,
        `증상: ${state.symptom_desc}`,
        `언제부터: ${state.since_when}`,
        `복용 약: ${state.current_meds.join(", ")}`,
        `해 본 것: ${state.tried_things.join(", ")}`,
        `프로필: ${[profile.nickname ? `호칭 ${profile.nickname}` : null, profile.age != null ? `나이 ${profile.age}` : null].filter(Boolean).join(", ") || "없음"}`,
        `지난 진료 메모: ${body.previous_note || "없음"}`,
        "",
        "다섯 칸이 모두 찼다. 이제 진료실에서 그대로 읽을 1인칭 대본 script(4~6문장, 순서는 언제부터, 어떻게 아픈지, 어떨 때 심해지는지, 복용 약, 이미 해본 것)와 의사에게 물을 questions 정확히 3개를 채운 JSON 하나만 출력해. next_field는 null, question은 null, chips는 빈 배열.",
        meds.length >= 2
          ? '복용 약이 2개 이상이니 먼저 툴로 DUR 병용금기와 효능군 중복을 확인하고, 등록된 사실이 있으면 대본에 "등록돼 있어 의사에게 확인하겠다"는 한 문장으로만 넣어. 위험하다거나 끊으라는 판단은 하지 마.'
          : null,
        "진단하거나 병명을 단정하지 말고 권유 문장으로 써. 날짜는 사용자가 말한 표현 그대로.",
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
  ];
}

// 요청에 실린 이전 state를 기본으로 깔고, 비어 있는 칸만 기본값 채움.
// 프론트가 state를 안 보내면(body.state 없음) 빈 state에서 시작하고,
// history.filled_fields로 "이전에 채워진 칸" 여부만 참고한다.
function buildState(body) {
  const { selected_part, user_text, previous_note } = body;
  const history = body.history || {};
  const filled = Array.isArray(history.filled_fields)
    ? history.filled_fields
    : [];
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
  if (!base.body_part && !filled.includes("body_part")) {
    base.body_part = extractBodyPart(user_text);
  }
  if (!base.symptom_desc && !filled.includes("symptom_desc")) {
    base.symptom_desc = extractSymptom(user_text);
  }
  if (!base.since_when && !filled.includes("since_when")) {
    base.since_when = extractWhen(user_text);
  }
  if (!base.current_meds.length && !filled.includes("current_meds")) {
    base.current_meds = extractMeds(user_text);
  }
  if (!base.tried_things.length && !filled.includes("tried_things")) {
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
function mergeState(existing, modelState, askedField, userText) {
  const merged = { ...existing };
  if (!modelState || typeof modelState !== "object") return merged;
  const negated =
    /잘\s*모르|모르겠|몰라|기억\s*안|없어|없음|안\s*먹|안\s*했|아직 아무/.test(
      userText || "",
    );
  for (const key of STATE_FIELDS) {
    const mv = modelState[key];
    if (mv === undefined || mv === null || mv === "") continue;
    // 사용자가 그 칸을 부정하지도 않았고 방금 물은 칸도 아닌데 모델이 "없음"을 채우면 환각으로 보고 버린다
    const noneLike = (Array.isArray(mv) ? mv.join(" ") : String(mv)).trim();
    if (
      /^(없음|없어|기억 안 남|모름)$/.test(noneLike) &&
      key !== askedField &&
      !negated
    )
      continue;
    if (key === "current_meds" || key === "tried_things") {
      const arr = Array.isArray(mv) ? mv : [mv];
      const cleaned = arr.map((x) => String(x).trim()).filter(Boolean);
      if (cleaned.length > 0) merged[key] = cleaned;
    } else {
      const s = Array.isArray(mv)
        ? mv.map(String).join(", ").trim()
        : String(mv).trim();
      if (s) merged[key] = s;
    }
  }
  if (merged.body_part) merged.body_part = normalizeBodyPart(merged.body_part);
  return merged;
}

// 이번 턴에 물었던 칸이 여전히 비어 있으면 사용자가 답한 문장을 그대로 넣는다. 탈출 칩은 없음 처리.
// 그 문장이 이미 다른 칸으로 읽혔으면 넣지 않는다
function fillAskedField(state, askedField, text, readAsOtherField = false) {
  if (!askedField || !STATE_FIELDS.includes(askedField)) return;
  if (isFilled(state[askedField])) return;
  const t = (text || "").trim();
  if (!t) return;
  if (wantsPillFinder(t)) return;
  if (readAsOtherField) return;
  let value = t;
  const skip =
    /잘\s*모르|모르겠|몰라|기억\s*안|없어|없음|안\s*먹|안\s*했|아직 아무/.test(
      t,
    );
  if (skip) {
    value = askedField === "since_when" ? "기억 안 남" : "없음";
  }
  if (askedField === "body_part") value = normalizeBodyPart(value);
  state[askedField] =
    askedField === "current_meds" || askedField === "tried_things"
      ? [value]
      : value;
}

function normalizeBodyPart(val) {
  if (typeof val !== "string") return val;
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
  const profileLine =
    [
      profile.nickname ? `호칭 ${profile.nickname}` : null,
      profile.age != null ? `나이 ${profile.age}` : null,
      profile.allergies ? `알레르기 ${profile.allergies}` : null,
      profile.chronic_diseases ? `기저질환 ${profile.chronic_diseases}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "없음";
  const asked =
    body.state && body.state.asked_field
      ? FIELD_LABEL[body.state.asked_field] || body.state.asked_field
      : null;
  return [
    { role: "system", content: SKILL_CONTENT },
    {
      role: "user",
      content: [
        "[지금까지 정리된 5칸]",
        `부위: ${state.body_part ? partLabel(state.body_part) : "미정"}`,
        `증상: ${state.symptom_desc || "미정"}`,
        `언제부터: ${state.since_when || "미정"}`,
        `복용 약: ${state.current_meds.length ? state.current_meds.join(", ") : "미정"}`,
        `해 본 것: ${state.tried_things.length ? state.tried_things.join(", ") : "미정"}`,
        `프로필: ${profileLine}`,
        `지난 진료 메모: ${body.previous_note || "없음"}`,
        asked ? `직전에 물은 칸: ${asked}` : null,
        "",
        `[사용자가 방금 한 말]\n${body.user_text}`,
        "",
        wantsPillFinder(body.user_text)
          ? "약 이름을 모르겠다고 했으니 반드시 pill_identify 툴을 호출해."
          : "이번 발화는 약 이름 찾기가 아니다. pill_identify를 호출하지 말고 JSON만 출력해.",
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
  ];
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
  SKILL_CONTENT = readFileSync(SKILL_PATH, "utf8").trim();
} catch (err) {
  console.error("[turn] SKILL.md 읽기 실패:", err.message);
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
  if (typeof msg.content === "string") {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      const t = typeof block === "string" ? block : block?.text;
      if (t && String(t).trim()) {
        content = String(t);
        break;
      }
    }
  }
  if (!content) return null;

  // 코드펜스나 앞뒤 설명이 섞여도 첫 { 부터 마지막 } 까지만 본다
  const stripped = content.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;

  // state: 아는 칸만 받고, 배열 칸은 배열로 맞춘다
  const rawState =
    parsed.state &&
    typeof parsed.state === "object" &&
    !Array.isArray(parsed.state)
      ? parsed.state
      : {};
  const state = {};
  for (const k of STATE_FIELDS) {
    const v = rawState[k];
    if (v === undefined || v === null) continue;
    if (k === "current_meds" || k === "tried_things") {
      const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
      const cleaned = arr.map((x) => String(x).trim()).filter(Boolean);
      if (cleaned.length) state[k] = cleaned;
    } else {
      const s = Array.isArray(v)
        ? v.map(String).join(", ").trim()
        : String(v).trim();
      if (s) state[k] = s;
    }
  }

  const nextField = STATE_FIELDS.includes(parsed.next_field)
    ? parsed.next_field
    : null;
  const question =
    typeof parsed.question === "string" && parsed.question.trim()
      ? parsed.question.trim()
      : null;
  const chips = Array.isArray(parsed.chips)
    ? parsed.chips
        .map((c) => {
          if (typeof c === "string")
            return c.trim() ? { id: c.trim(), label: c.trim() } : null;
          if (!c || typeof c !== "object") return null;
          const label = String(c.label ?? c.id ?? "").trim();
          if (!label) return null;
          return {
            id: String(c.id ?? label),
            label,
            isEscape: c.isEscape === true,
            isBodyPart: c.isBodyPart === true,
          };
        })
        .filter(Boolean)
    : [];
  const script = Array.isArray(parsed.script)
    ? parsed.script.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions.map((q) => String(q).trim()).filter(Boolean)
    : [];

  return {
    state,
    next_field: nextField,
    question,
    chips,
    emergency_suspected: parsed.emergency_suspected === true,
    script,
    questions,
  };
}

// ---------- 칩 조립 ----------

function buildChips(modelChips, nextField) {
  if (!Array.isArray(modelChips) || modelChips.length === 0) {
    return defaultChips(nextField);
  }

  // 모델 칩 그대로 쓰되, 같은 라벨은 하나만. 마지막이 탈출 칩이 아니면 탈출 칩 추가
  const seen = new Set();
  const out = [];
  for (const c of modelChips) {
    if (!c || !c.label || seen.has(c.label)) continue;
    seen.add(c.label);
    out.push({
      id: c.id || c.label,
      label: c.label,
      isEscape:
        c.isEscape === true ||
        /잘\s*모르|모르겠|기억\s*안|^없어$|^없음$/.test(c.label),
      isBodyPart:
        nextField === "body_part"
          ? c.isBodyPart !== false
          : c.isBodyPart === true,
    });
  }
  // 탈출 칩은 맨 뒤 하나만
  const escapes = out.filter((o) => o.isEscape);
  if (escapes.length > 1) {
    const keep = escapes[escapes.length - 1];
    for (let i = out.length - 1; i >= 0; i -= 1)
      if (out[i].isEscape && out[i] !== keep) out.splice(i, 1);
  }
  if (escapes.length === 1 && !out[out.length - 1].isEscape) {
    const idx = out.findIndex((o) => o.isEscape);
    out.push(out.splice(idx, 1)[0]);
  }

  if (out.length === 0 || !out[out.length - 1].isEscape) {
    out.push({
      id: "escape",
      label: "잘 모르겠어",
      isEscape: true,
      isBodyPart: false,
    });
  }

  if (
    nextField === "current_meds" &&
    !out.some((o) => o.id === "이름몰라" || o.label === "이름 몰라요")
  ) {
    const escape = out[out.length - 1]?.isEscape ? out.pop() : null;
    out.push({
      id: "이름몰라",
      label: "이름 몰라요",
      isEscape: false,
      isBodyPart: false,
    });
    if (escape) out.push(escape);
  }

  // 4~6개 범위로 보정
  if (out.length < 4) {
    const defs = defaultChips(nextField).filter(
      (d) =>
        d.id !== "escape" &&
        !out.some((o) => o.id === d.id || o.label === d.label),
    );
    while (out.length < 5 && defs.length) {
      out.splice(out.length - 1, 0, defs.shift());
    }
  }
  if (out.length > 6) {
    out.splice(5); // 탈출 칩은 유지
    if (!out[out.length - 1].isEscape) {
      out.push({
        id: "escape",
        label: "잘 모르겠어",
        isEscape: true,
        isBodyPart: false,
      });
    }
  }

  return out;
}

function defaultChips(nextField) {
  if (nextField === "body_part") {
    return [
      { id: "head", label: "머리", isBodyPart: true },
      { id: "eye", label: "눈", isBodyPart: true },
      { id: "chest", label: "가슴", isBodyPart: true },
      { id: "abdomen", label: "배", isBodyPart: true },
      { id: "skin", label: "피부", isBodyPart: true },
      { id: "escape", label: "잘 모르겠어", isEscape: true, isBodyPart: false },
    ];
  }
  if (nextField === "symptom_desc") {
    return [
      { id: "통증", label: "아파요", isBodyPart: false },
      { id: "쓰림", label: "쓰려요", isBodyPart: false },
      { id: "가려움", label: "가려워요", isBodyPart: false },
      { id: "이상감각", label: "이상한 느낌이 들어요", isBodyPart: false },
      { id: "escape", label: "잘 모르겠어", isEscape: true, isBodyPart: false },
    ];
  }
  if (nextField === "since_when") {
    return [
      { id: "오늘", label: "오늘", isBodyPart: false },
      { id: "3일전", label: "3일 전쯤", isBodyPart: false },
      { id: "1주전", label: "1주 전쯤", isBodyPart: false },
      { id: "한달전", label: "한 달 전쯤", isBodyPart: false },
      { id: "escape", label: "잘 모르겠어", isEscape: true, isBodyPart: false },
    ];
  }
  if (nextField === "current_meds") {
    return [
      { id: "타이레놀", label: "타이레놀", isBodyPart: false },
      { id: "이름몰라", label: "이름 몰라요", isBodyPart: false },
      { id: "없음", label: "먹는 약 없어요", isBodyPart: false },
      { id: "escape", label: "잘 모르겠어", isEscape: true, isBodyPart: false },
    ];
  }
  if (nextField === "tried_things") {
    return [
      { id: "약국", label: "약국에서 약 사 먹음", isBodyPart: false },
      { id: "진료", label: "병원 진료 받았음", isBodyPart: false },
      { id: "검사", label: "검사 받았음", isBodyPart: false },
      { id: "없음", label: "아직 아무것도 안 함", isBodyPart: false },
      { id: "escape", label: "잘 모르겠어", isEscape: true, isBodyPart: false },
    ];
  }
  // 기본
  return [
    { id: "option1", label: "선택 1", isBodyPart: false },
    { id: "option2", label: "선택 2", isBodyPart: false },
    { id: "option3", label: "선택 3", isBodyPart: false },
    { id: "option4", label: "선택 4", isBodyPart: false },
    { id: "escape", label: "잘 모르겠어", isEscape: true, isBodyPart: false },
  ];
}

// ---------- fallback 결과(모델 JSON 파싱 실패 시에만 사용) ----------

function buildFallbackResult(body, state, deptOverride) {
  const depts =
    deptOverride.length > 0 ? deptOverride : getDepartmentTop3(state.body_part);
  return {
    department_top3: depts.map((d) => ({ name: d.name, reason: d.reason })),
    script: buildFallbackScript(state),
    questions: buildFallbackQuestions(state),
    photos: (body.photos || []).map((p) => ({
      label: p.label,
      caption: p.caption,
    })),
    note_placeholder: "의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요",
  };
}

function buildFallbackScript(state) {
  const parts = [];
  if (state.since_when)
    parts.push(
      `${state.since_when}부터 ${partLabel(state.body_part)} 쪽이 불편했어요.`,
    );
  else if (state.body_part)
    parts.push(`${partLabel(state.body_part)} 쪽이 불편해요.`);
  if (state.symptom_desc)
    parts.push(`증상은 ${state.symptom_desc} 느낌이에요.`);
  if (state.current_meds.length > 0)
    parts.push(`지금 먹는 약은 ${state.current_meds.join(", ")}이에요.`);
  if (state.tried_things.length > 0)
    parts.push(`그동안 해 본 것은 ${state.tried_things.join(", ")}이에요.`);
  return parts.length > 0 ? parts : ["아직 정보가 부족해요. 더 알려주세요."];
}

function buildFallbackQuestions(state) {
  const qs = [];
  if (state.current_meds.length > 0) qs.push("이 약 계속 먹어도 되나요?");
  if (state.tried_things.length > 0 && state.tried_things[0] !== "없음")
    qs.push("해 본 것들이 효과가 없었는데 다른 원인일 수 있나요?");
  qs.push("검사가 필요한가요?");
  return qs.slice(0, 3);
}

// ---------- 기존 extract 함수들(기본적으로 비어 있는 칸만 채움) ----------

function extractSymptom(text) {
  if (
    /아프|통증|쓰림|가려움|두드러기|발진|열|기침|콧물|설사|변비|메스꺼움|구토|두통|어지러움|숨차|가슴통증|복통|관절통/i.test(
      text,
    )
  ) {
    return (
      text.match(
        /(아프|통증|쓰림|가려움|두드러기|발진|열|기침|콧물|설사|변비|메스꺼움|구토|두통|어지러움|숨차|가슴통증|복통|관절통)/i,
      )?.[0] || "통증"
    );
  }
  return null;
}

function extractWhen(text) {
  const when = text.match(
    /(\d+일\s*전|\d+주\s*전|\d+개월\s*전|\d+시간\s*전|어제|그제|오늘|며칠\s*전|1주일\s*전|2주일\s*전|3주일\s*전|한\s*달\s*전|두\s*달\s*전)/i,
  );
  return when ? when[0] : null;
}

function wantsPillFinder(text) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (/^잘\s*모르겠어$|^먹는 약 없어요$|^안\s*먹/.test(t)) return false;
  if (
    /^이름 몰라요$|^이름을 알려줘$|^약 이름 찾아줘$|^모양이랑 색으로 찾기$/.test(
      t,
    )
  ) {
    return true;
  }
  if (/모양.{0,8}(색|찾)|색으로\s*찾/.test(t)) return true;
  if (/이름/.test(t) && /(모르|몰라|알려|찾아)/.test(t)) return true;
  if (/(무슨\s*약|약\s*이름)/.test(t) && /(모르|몰라|알려|찾아)/.test(t)) {
    return true;
  }
  return false;
}

function emitOpenPillFinder(events, prefill = {}) {
  if (
    events.some(
      (e) => e.event === "ui_action" && e.payload?.action === "open_pill_finder",
    )
  ) {
    return;
  }
  events.push({
    event: "ui_action",
    line: "모양이랑 색으로 찾기 열기",
    body: null,
    hint: null,
    tool: "pill_identify",
    tool_status: "ok",
    tool_error: null,
    payload: {
      action: "open_pill_finder",
      shape: prefill.shape || "",
      color: prefill.color || "",
      imprint: prefill.imprint || "",
    },
  });
}

async function runPillIdentifyTool(events) {
  if (events.some((e) => e.event === "tool_call" && e.tool === "pill_identify")) {
    return;
  }
  events.push({
    event: "tool_call",
    line: "낱알식별 호출",
    body: null,
    hint: null,
    tool: "pill_identify",
    tool_status: "called",
    tool_error: null,
    payload: { args: {} },
  });
  let toolRes;
  try {
    toolRes = await TOOL_MAP.pill_identify({});
  } catch (err) {
    toolRes = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  events.push({
    event: "tool_result",
    line: toolRes?.ok
      ? "낱알식별: 모양이랑 색으로 찾기 열기"
      : `낱알식별: 호출 실패, ${toolRes?.error || "알 수 없음"}`,
    body: null,
    hint: null,
    tool: "pill_identify",
    tool_status: toolRes?.ok ? "ok" : "failed",
    tool_error: toolRes?.ok ? null : toolRes?.error || "실패",
    payload: toolRes,
  });
  if (toolRes?.ok) emitOpenPillFinder(events, toolRes.result || {});
}

function extractMeds(text) {
  const meds = [];
  const medPattern = /타이레놀|아스피린|게보린|부루펜|이지엔6|펜잘|판피린/gi;
  let match;
  while ((match = medPattern.exec(text)) !== null) {
    meds.push(match[0].trim());
  }
  return meds;
}

function extractTried(text, previousNote) {
  const tried = [];
  if (/진료\s*받았어|병원\s*갔어|약\s*먹었어|검사\s*받았어/i.test(text)) {
    tried.push("진료/약국 방문");
  }
  if (previousNote) tried.push(previousNote);
  return tried;
}

// ---------- 이벤트 헬퍼 ----------

function done(steps, tools, emergency) {
  return {
    event: "done",
    line: emergency
      ? "done, 응급으로 종료"
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
    JSON.stringify(
      {
        ok: true,
        turn_index,
        events,
        state,
        source_note,
      },
      null,
      2,
    ),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
