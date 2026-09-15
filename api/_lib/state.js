// _lib/state.js
// 상태 5칸: body_part, symptom_desc, since_when, current_meds, tried_things

export const STATE_FIELDS = [
  'body_part',
  'symptom_desc',
  'since_when',
  'current_meds',
  'tried_things',
];

export function summarizeState(state) {
  const filled = STATE_FIELDS.filter((f) => {
    const v = state[f];
    if (Array.isArray(v)) return v.length > 0;
    return v && v !== '';
  });
  const next = STATE_FIELDS.find((f) => {
    const v = state[f];
    if (Array.isArray(v)) return v.length === 0;
    return !v || v === '';
  });
  return { filled, next };
}
