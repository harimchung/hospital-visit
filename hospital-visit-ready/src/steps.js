// 단계 정의
const STEPS = {
  WHERE: 'where',
  PHOTO: 'photo',
  HOW: 'how',
  WORSE: 'worse',
  SINCE: 'since',
  SINCE_RETRY: 'since-retry',
  MEDS: 'meds',
  TRIED: 'tried',
  TRIED_VISIT: 'tried-visit',
  QUESTIONS: 'questions',
  RESULT: 'result',
};

// 부위별 how 칩
const HOW_CHIPS_BY_PART = {
  head: [
    { id: 'throbbing', label: '지끈거려' },
    { id: 'one_side', label: '한쪽만' },
    { id: 'dizzy', label: '어지러워' },
    { id: 'fever', label: '열이 나' },
    { id: 'hard_to_describe', label: '설명하기 어려워' },
  ],
  face_neck: [
    { id: 'blocked', label: '막혀' },
    { id: 'runny_nose', label: '콧물' },
    { id: 'sore_throat', label: '목이 따가워' },
    { id: 'ear_stuffy', label: '귀가 먹먹해' },
    { id: 'hard_to_describe', label: '설명하기 어려워' },
  ],
  chest: [
    { id: 'painful', label: '아파' },
    { id: 'uncomfortable', label: '불편해' },
    { id: 'hard_to_describe', label: '설명하기 어려워' },
  ],
  abdomen: [
    { id: 'sour', label: '쓰려' },
    { id: 'bloated', label: '더부룩해' },
    { id: 'stabbing', label: '찌르듯이' },
    { id: 'diarrhea', label: '설사도 해' },
    { id: 'nausea', label: '토할 것 같아' },
    { id: 'hard_to_describe', label: '설명하기 어려워' },
  ],
  back_joint: [
    { id: 'movement_pain', label: '움직이면 아파' },
    { id: 'rest_pain', label: '가만있어도 아파' },
    { id: 'numb', label: '저려' },
    { id: 'swollen', label: '부었어' },
    { id: 'hard_to_describe', label: '설명하기 어려워' },
  ],
  skin: [
    { id: 'itchy', label: '가려워' },
    { id: 'red', label: '빨갛게 올라와' },
    { id: 'blister', label: '물집' },
    { id: 'swollen_skin', label: '부어' },
    { id: 'discharge', label: '진물' },
    { id: 'hard_to_describe', label: '설명하기 어려워' },
  ],
  other: [
    { id: 'painful', label: '아파' },
    { id: 'uncomfortable', label: '불편해' },
    { id: 'hard_to_describe', label: '설명하기 어려워' },
  ],
};

// 통증 계열 판정 칩 ID
const PAIN_CHIP_IDS = new Set([
  'throbbing', 'one_side', 'sour', 'stabbing', 'movement_pain', 'rest_pain',
  'sore_throat', 'painful',
]);

// 피부 계열 칩 ID
const SKIN_CHIP_IDS = new Set(['itchy', 'red', 'blister', 'swollen_skin', 'discharge']);

// 부위별 worse 칩
const WORSE_CHIPS_BY_TYPE = {
  pain: [
    { id: 'morning', label: '아침에' },
    { id: 'night', label: '밤에' },
    { id: 'scratching', label: '긁으면' },
    { id: 'sweat', label: '땀 나면' },
    { id: 'after_eating', label: '먹고 나면' },
    { id: 'movement', label: '움직이면' },
    { id: 'dont_know', label: '잘 모르겠어' },
  ],
  skin: [
    { id: 'morning', label: '아침에' },
    { id: 'night', label: '밤에' },
    { id: 'scratching', label: '긁으면' },
    { id: 'sweat', label: '땀 나면' },
    { id: 'dont_know', label: '잘 모르겠어' },
  ],
};

// 공통 이후 worse 칩 (how가 통증 계열이 아닐 때)
const COMMON_WORSE_CHIPS = [
  { id: 'none', label: '잘 모르겠어' },
];

// since 칩
const SINCE_CHIPS = [
  { id: 'today', label: '오늘' },
  { id: 'yesterday', label: '어제' },
  { id: '2_3days', label: '2~3일 전' },
  { id: 'about_week', label: '일주일쯤' },
  { id: 'over_2weeks', label: '2주 넘게' },
  { id: 'over_month', label: '한 달 넘게' },
  { id: 'early_this_month', label: '이번 달 초' },
  { id: 'dont_know', label: '기억 안 남' },
];

// since-retry 칩
const SINCE_RETRY_CHIPS = [
  { id: 'early_this_month', label: '이번 달 초' },
  { id: 'last_month', label: '지난달' },
  { id: 'dont_know', label: '기억 안 남' },
];

// meds 칩
const MEDS_CHIPS = [
  { id: 'load_recent', label: '최근 처방약 불러오기' },
  { id: 'input_name', label: '약 이름 입력' },
  { id: 'find_by_shape', label: '모양이랑 색으로 찾기' },
  { id: 'no_meds', label: '안 먹어' },
];

// tried 칩
const TRIED_CHIPS = [
  { id: 'pharm_meds', label: '약국 약 먹었어' },
  { id: 'rested', label: '쉬었어' },
  { id: 'cold_pack', label: '찜질, 냉찜질' },
  { id: 'hospital_visit', label: '병원 다녀왔어' },
  { id: 'none', label: '없어' },
];

// 질문 생성 규칙
function generateQuestions(visit) {
  const questions = [];
  
  if (visit.meds && visit.meds.selected) {
    questions.push('이 약 계속 먹어도 되나요');
  }
  if (visit.worse && visit.worse.selected) {
    questions.push(`${visit.worse.selected}에 더 심해지는 건 왜 그런가요`);
  }
  if (visit.tried && visit.tried.selected === 'hospital_visit' && visit.tried.visitNote) {
    questions.push(`${visit.tried.visitNote}했는데 그대로면 다른 원인일 수 있나요`);
  }
  
  questions.push('검사가 필요한가요');
  
  // 최대 4개까지만 (기본 3개 + 직접 추가 가능)
  return questions.slice(0, 4);
}

function getStepConfig(step, visit) {
  switch (step) {
    case STEPS.WHERE:
      return {
        question: '어디가 아파요?',
        hint: '여러 군데면 \'여러 군데\'를 누르고 차례로 골라요',
        chips: [
          { id: 'head', label: '머리' },
          { id: 'face_neck', label: '눈, 귀, 코, 목' },
          { id: 'chest', label: '가슴' },
          { id: 'abdomen', label: '배' },
          { id: 'back_joint', label: '허리, 관절' },
          { id: 'skin', label: '피부' },
          { id: 'multiple', label: '여러 군데' },
          { id: 'other', label: '그 외' },
        ],
        lastChipEscape: true,
      };
    
    case STEPS.PHOTO:
      return {
        question: '사진 찍어 둘래요? 밤이랑 아침이 다르게 보일 때 나란히 비교할 수 있어요.',
        hint: null,
        chips: [
          { id: 'take_photo', label: '사진 찍기' },
          { id: 'next', label: '다음' },
        ],
        lastChipEscape: false,
        condition: visit.part && ['skin', 'face_neck'].includes(visit.part),
      };
    
    case STEPS.HOW:
      const part = visit.part || 'other';
      const howChips = HOW_CHIPS_BY_PART[part] || HOW_CHIPS_BY_PART.other;
      return {
        question: `${partToLabel(part)}가 어떻게 아파요?`,
        hint: '칩은 고른 부위에 따라 바뀌어요',
        chips: howChips,
        lastChipEscape: true,
        isPain: PAIN_CHIP_IDS.has(visit.how?.selected),
        isSkin: SKIN_CHIP_IDS.has(visit.how?.selected),
      };
    
    case STEPS.WORSE:
      if (!visit.how || !visit.how.selected) {
        return null;
      }
      if (visit.how.isSkin) {
        return {
          question: '어떨 때 더 심해져요?',
          hint: '통증 계열만 한 번 더 물어요',
          chips: WORSE_CHIPS_BY_TYPE.skin,
          lastChipEscape: false,
          condition: true,
        };
      }
      if (visit.how.isPain) {
        return {
          question: '어떨 때 더 심해져요?',
          hint: '통증 계열만 한 번 더 물어요',
          chips: WORSE_CHIPS_BY_TYPE.pain,
          lastChipEscape: false,
          condition: true,
        };
      }
      // 피부/통증이 아니면 건너뜀
      return null;
    
    case STEPS.SINCE:
      return {
        question: '언제부터 그랬어요?',
        hint: '한 번만 되묻고, 그래도 모르면 \'기억 안 남\'으로 적어요',
        chips: SINCE_CHIPS,
        lastChipEscape: true,
      };
    
    case STEPS.SINCE_RETRY:
      return {
        question: '대략만요. 이번 달 초쯤? 지난달?',
        hint: null,
        chips: SINCE_RETRY_CHIPS,
        lastChipEscape: false,
      };
    
    case STEPS.MEDS:
      const showLoadRecent = visit.history && visit.history.length > 0;
      const medsChips = showLoadRecent
        ? MEDS_CHIPS
        : MEDS_CHIPS.filter(c => c.id !== 'load_recent');
      return {
        question: '지금 먹는 약 있어요? 처방약도 같이요.',
        hint: showLoadRecent 
          ? '\'최근 처방약 불러오기\'는 이 브라우저에 지난 진료 메모가 있을 때만 보여요'
          : null,
        chips: medsChips,
        lastChipEscape: false,
      };
    
    case STEPS.TRIED:
      return {
        question: '낫게 하려고 해 본 거 있어요?',
        hint: null,
        chips: TRIED_CHIPS,
        lastChipEscape: false,
      };
    
    case STEPS.TRIED_VISIT:
      return {
        question: '그때 뭐라고 하셨어요? 다음 진료에 이어서 쓰게 적어 둘게요.',
        hint: null,
        chips: null, // 자유 입력
        isFreeInput: true,
        lastChipEscape: false,
      };
    
    case STEPS.QUESTIONS:
      const questions = generateQuestions(visit);
      const questionList = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
      return {
        question: `이 세 가지 물어보면 될까요?\n${questionList}`,
        hint: '질문은 사용자가 쓰지 않아요. 답한 걸로 먼저 만들어 보여 줘요',
        chips: [
          { id: 'keep', label: '이대로' },
          { id: 'change', label: '하나 바꿀래' },
          { id: 'add', label: '직접 추가' },
        ],
        lastChipEscape: false,
      };
    
    case STEPS.RESULT:
      return {
        question: null,
        hint: null,
        chips: null,
        isResult: true,
      };
    
    default:
      return null;
  }
}

function partToLabel(partId) {
  const labels = {
    head: '머리',
    face_neck: '눈, 귀, 코, 목',
    chest: '가슴',
    abdomen: '배',
    back_joint: '허리, 관절',
    skin: '피부',
    other: '그 외',
  };
  return labels[partId] || partId;
}

// 단계 순서 및 건너뛰기 규칙
function getNextStep(currentStep, visit, chipId) {
  switch (currentStep) {
    case STEPS.WHERE:
      if (chipId === 'multiple') {
        return STEPS.WHERE; // 여러 군데면 같은 단계 유지, 추가 부위 선택
      }
      // 첫 부위 기준 진행, 나머지 부위는 결과 카드에 한 줄로 추가
      return STEPS.PHOTO;
    
    case STEPS.PHOTO:
      if (chipId === 'take_photo') {
        return STEPS.PHOTO; // 사진 더 찍기
      }
      return STEPS.HOW;
    
    case STEPS.HOW:
      return STEPS.WORSE;
    
    case STEPS.WORSE:
      if (visit.how && visit.how.isSkin) {
        // 피부 계열: worse 건너뛰고 since로
        return STEPS.SINCE;
      }
      return STEPS.SINCE;
    
    case STEPS.SINCE:
      if (chipId === 'dont_know' || chipId === 'over_2weeks' || chipId === 'over_month') {
        // "기억 안 남"류가 아니면 바로 다음
        return STEPS.MEDS;
      }
      // "잘 모르겠어" 자유입력 시 since-retry
      return STEPS.SINCE_RETRY;
    
    case STEPS.SINCE_RETRY:
      return STEPS.MEDS;
    
    case STEPS.MEDS:
      if (chipId === 'no_meds') {
        return STEPS.TRIED;
      }
      if (chipId === 'find_by_shape') {
        return 'SEARCH_MED'; // S6 풀스크린 패널 (별도 상태)
      }
      if (chipId === 'input_name') {
        return STEPS.MEDS; // 자유 입력 후 처리
      }
      if (chipId === 'load_recent') {
        return STEPS.MEDS; // 불러오기 후 표시
      }
      return STEPS.TRIED;
    
    case STEPS.TRIED:
      if (chipId === 'hospital_visit') {
        return STEPS.TRIED_VISIT;
      }
      return STEPS.QUESTIONS;
    
    case STEPS.TRIED_VISIT:
      return STEPS.QUESTIONS;
    
    case STEPS.QUESTIONS:
      if (chipId === 'keep') {
        return STEPS.RESULT;
      }
      if (chipId === 'change') {
        return STEPS.QUESTIONS; // 칩으로 바꿀 질문 선택
      }
      if (chipId === 'add') {
        return STEPS.QUESTIONS; // 자유 입력으로 4번째 질문 추가
      }
      return STEPS.RESULT;
    
    default:
      return null;
  }
}

export { 
  STEPS, 
  getStepConfig, 
  getNextStep, 
  HOW_CHIPS_BY_PART,
  PAIN_CHIP_IDS,
  SKIN_CHIP_IDS,
  SINCE_CHIPS,
  SINCE_RETRY_CHIPS,
  MEDS_CHIPS,
  TRIED_CHIPS,
  generateQuestions,
  partToLabel,
};
