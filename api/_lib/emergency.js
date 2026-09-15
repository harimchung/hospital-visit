// _lib/emergency.js
// 응급 신호 10개 코드 판정(PRD/SKILL.md 그대로). 키워드 표 기반.
// 반환: { emergency: { signal, cond } } 또는 { ok: true }

const SIGNALS = [
  {
    id: '의식 저하',
    test: (text) => /\b(의식이|의식 저하|의식 없|정신 없|헛소리|횡설수설|깨우기 어렵)\b/i.test(text),
  },
  {
    id: '한쪽 마비',
    test: (text) => /\b(한쪽|반신|팔다리 힘|마비|감각 없|한쪽만|말이 어눌)\b/i.test(text),
  },
  {
    id: '흉통 20분 이상',
    test: (text) => /\b(가슴|흉통|흉부|명치)\b.*\b(쥐어짜|조여|눌리|통증)\b/i.test(text) &&
                    /\b(20분|30분|계속|오래)\b/i.test(text),
  },
  {
    id: '호흡곤란',
    test: (text) => /\b(숨|호흡|숨쉬|호흡곤란|숨이|숨 못|숨차)\b/i.test(text),
  },
  {
    id: '지혈 안 됨',
    test: (text) => /\b(지혈|피 안 멎|피가 안|계속 나|상처|출혈)\b/i.test(text),
  },
  {
    id: '급성 두통',
    test: (text) => /\b(두통|머리 아프|갑자기.*두통|심한 두통)\b/i.test(text),
  },
  {
    id: '경련',
    test: (text) => /\b(경련|발작|몸이 굳|떨림|의식 잃)\b/i.test(text),
  },
  {
    id: '토혈/흑변',
    test: (text) => /\b(토혈|피를 토|커피색 토|검붉은 토|위장 출혈|토에서 피|검은 변|흑변)\b/i.test(text),
  },
  {
    id: '딱딱한 복통',
    test: (text) => /\b(배가 딱딱|복부 경직|배 경직|배가 굳)\b/i.test(text),
  },
  {
    id: '고열+목 뻣뻣함',
    test: (text) => /\b(고열|열|발열)\b.*\b(목 뻣뻣|목이 뻣뻣|neck stiff|목 경직)\b/i.test(text),
  },
];

export function checkEmergency(userText) {
  if (!userText) return { ok: true };
  for (const s of SIGNALS) {
    if (s.test(userText)) {
      return {
        emergency: {
          signal: s.id,
          cond: `${s.id}이 계속되는 건 바로 병원에 가야 하는 신호예요. 대본은 만들지 않아요.`,
        },
      };
    }
  }
  return { ok: true };
}
