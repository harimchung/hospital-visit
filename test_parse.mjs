const STATE_FIELDS = ['body_part', 'symptom_desc', 'since_when', 'current_meds', 'tried_things'];

function parseSolarReply(choice) {
  const msg = choice?.message;
  if (!msg) return null;
  let content = null;
  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
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
  const modelState = parsed.state;
  if (!modelState || typeof modelState !== 'object' || Array.isArray(modelState)) return null;
  for (const k of Object.keys(modelState)) {
    if (!STATE_FIELDS.includes(k)) return null;
    const v = modelState[k];
    if (v !== null && v !== undefined && v !== '') {
      if (Array.isArray(v)) {
        if (!v.every((x) => typeof x === 'string')) return null;
      } else if (typeof v !== 'string') {
        return null;
      }
    }
  }
  if (parsed.next_field !== undefined && parsed.next_field !== null) {
    if (!STATE_FIELDS.includes(parsed.next_field)) return null;
  }
  if (parsed.question !== undefined && typeof parsed.question !== 'string') return null;
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
  if (parsed.emergency_suspected !== undefined && typeof parsed.emergency_suspected !== 'boolean') return null;
  if (parsed.script !== undefined) {
    if (!Array.isArray(parsed.script) || !parsed.script.every((s) => typeof s === 'string')) return null;
  }
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

const broken = '{ 깨진';
const result = parseSolarReply({ message: { content: broken } });
console.log(JSON.stringify({ input: broken, result }, null, 2));
