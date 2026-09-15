// 카피 — design.md 8장
// 화면에 들어가는 문구를 한 곳에서 관리한다.
// 우선적으로 질문은 여기에 있는 text를 사용하고,
// 추후에 agent 혹은 백엔드 연결 시, 응답된 데이터를 사용하도록 한다.

export const COPY = {
  'app.title': '병원 가기 전',
  'input.placeholder': '직접 입력해도 돼요',
  'input.placeholder.pill': '약 이름을 알면 여기에',
  'photo.saved': '저장했어요. 이 브라우저에만 남고 서버로는 안 가요.',
  'photo.ask': '사진 찍어 둘래요? 밤이랑 아침이 다르게 보일 때 나란히 비교할 수 있어요.',
  'since.retry': '대략만요. 이번 달 초쯤? 지난달?',
  'meds.hint': '최근 처방약 불러오기는 이 브라우저에 지난 진료 메모가 있을 때만 보여요',
  'pill.go': '그럼 모양이랑 색으로 찾아볼게요.',
  'pill.footer': '고른 약은 e약은요, 그다음 DUR(같은 계열 겹침, 같이 먹으면 안 되는 조합, 65세 이상 주의) 순서로 확인해요. 결과는 등록돼 있어요, 의사에게 확인하세요까지만 말해요.',
  'pill.empty': '이 조합으로는 못 찾았어요. 약 봉투나 처방전 사진을 찍어 두면 의사에게 보여 줄 수 있어요.',
  'tried.visit': '그때 뭐라고 하셨어요? 다음 진료에 이어서 쓰게 적어 둘게요.',
  'questions.ask': '이 세 가지 물어보면 될까요?',
  'questions.hint': '질문은 사용자가 쓰지 않아요. 답한 걸로 먼저 만들어 보여 줘요',
  'result.dept.note': '규칙표로 고른 거예요. 진단이 아니에요.',
  'result.note.placeholder': '의사가 뭐라고 했는지 적어 두면 다음 대본에 들어가요',
  'emergency.title': '지금 119',
  'emergency.body': '{signal}이 {cond} 계속되는 건 바로 병원에 가야 하는 신호예요. 대본은 만들지 않아요.',
  'emergency.cta': '119 전화하기',
  'drawer.title': '진료 기록',
  'drawer.caption': '이 브라우저에만 저장, 암호화',
  'drawer.new': '+ 새 진료 준비',
  'drawer.clear': '기록 전부 지우기',
  'drawer.clear.confirm': '이 브라우저의 프로필, 사진, 메모를 전부 지워요. 되돌릴 수 없어요.',
  'where.hint': '칩을 고르거나, 직접 말해도 돼요',
  'where.ask': '어디가 아파요?',
  'drawer.section.visits': '지난 진료',
  'drawer.profile.empty': '프로필이 없어요',
  'drawer.visits.empty': '지난 진료 기록이 없어요.',
  'card.photos.title': '찍어 둔 사진',
  'card.dept.title': '어느 과로 갈까요',
  'card.script.title': '진료실에서 이렇게 말해요',
  'card.questions.title': '꼭 물어볼 세 가지',
  'card.action.copy': '복사',
  'card.action.print': 'PDF로 저장',
}

export function t(key, vars = {}) {
  let text = COPY[key] || key
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(`{${k}}`, v)
  }
  return text
}
