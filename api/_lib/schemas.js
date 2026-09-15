// _lib/schemas.js
// 요청/응답 스키마 검증(가볍게). Zod 없이 수동 검사.

export function validateTurnRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('body 객체 필요');
  if (typeof body.session_id !== 'string' || !body.session_id) errors.push('session_id 필요');
  if (typeof body.turn_index !== 'number' || !Number.isInteger(body.turn_index)) errors.push('turn_index 필요');
  if (typeof body.user_text !== 'string') errors.push('user_text 필요');
  if (body.selected_part !== undefined && !['head','face_neck','chest','abdomen','back_joint','skin','other','multiple','eye','ear','neck','nose','waist','knee',null].includes(body.selected_part)) errors.push('selected_part 값 이상');
  return errors;
}

export function validatePillRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('body 객체 필요');
  if (!body.kind || !['drug_name','drug_dup','drug_contra','elderly_caution','pill_identify'].includes(body.kind)) errors.push('kind 필요');
  if (!body.params || typeof body.params !== 'object') errors.push('params 필요');
  return errors;
}
