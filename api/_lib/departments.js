// _lib/departments.js
// 진료과 규칙표 v1 + 애매 시 내과/가정의학과
// 입력: body_part (부위 ID). 프론트 ID를 그대로 받을 수 있게 매핑함.
// ear·neck·nose → face_neck(이비인후과), waist·knee → back_joint(정형외과)

const FRONTEND_PART_MAP = {
  ear: 'face_neck',
  neck: 'face_neck',
  nose: 'face_neck',
  waist: 'back_joint',
  knee: 'back_joint',
};

const DEPT_RULES = {
  skin: [
    { name: '피부과', reason: '피부 증상 + 규칙표 기준' },
    { name: '가정의학과', reason: '애매하면 가정의학과' },
    { name: '알레르기내과', reason: '가렵고 반복되면 알레르기내과' },
  ],
  abdomen: [
    { name: '내과', reason: '배 증상 + 규칙표 기준' },
    { name: '가정의학과', reason: '애매하면 가정의학과' },
    { name: '소화기내과', reason: '소화기 증상 동반 시' },
  ],
  head: [
    { name: '신경과', reason: '머리 증상 + 규칙표 기준' },
    { name: '내과', reason: '애매하면 내과' },
    { name: '가정의학과', reason: '애매하면 가정의학과' },
  ],
  back_joint: [
    { name: '정형외과', reason: '허리·관절 증상 + 규칙표 기준' },
    { name: '재활의학과', reason: '재활·만성 통증이 있으면' },
    { name: '가정의학과', reason: '애매하면 가정의학과' },
  ],
  face_neck: [
    { name: '이비인후과', reason: '귀·코·목 증상 + 규칙표 기준' },
    { name: '내과', reason: '애매하면 내과' },
    { name: '가정의학과', reason: '애매하면 가정의학과' },
  ],
  eye: [
    { name: '안과', reason: '눈 증상 + 규칙표 기준' },
    { name: '내과', reason: '애매하면 내과' },
    { name: '가정의학과', reason: '애매하면 가정의학과' },
  ],
  chest: [
    { name: '내과', reason: '가슴 증상 + 규칙표 기준 (응급 제외)' },
    { name: '가정의학과', reason: '애매하면 가정의학과' },
    { name: '소화기내과', reason: '식도·위 증상 동반 시' },
  ],
  other: [
    { name: '내과', reason: '애매하면 내과' },
    { name: '가정의학과', reason: '애매하면 가정의학과' },
    { name: '일반의', reason: '일단 진료 후 분과 안내' },
  ],
  multiple: [
    { name: '가정의학과', reason: '여러 부위 + 규칙표 기준' },
    { name: '내과', reason: '애매하면 내과' },
    { name: '일반의', reason: '일단 진료 후 분과 안내' },
  ],
};

export function getDepartmentTop3(bodyPart, symptomDesc = '') {
  const mapped = FRONTEND_PART_MAP[bodyPart] || bodyPart;
  const list = DEPT_RULES[mapped] || DEPT_RULES.other;
  return list.map((d, i) => ({
    name: d.name,
    reason: d.reason,
    rank: i + 1,
  }));
}
