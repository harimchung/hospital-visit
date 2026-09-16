// api/_lib/tools.js
// 툴 정의(6개), 툴 맵(6개), 공공데이터 fetch·유틸, 조회 함수.
// TOOL_DEFS 이름은 영문만(lookup_drug, dur_duplicate, dur_contraindication, dur_elderly, pill_identify, department_rules).
// 화면·로그 표시용 한글 툴 이름은 TOOL_LABEL로 분리.
// description은 SKILL.md 약 API 절차 규칙 기반(요청 파라미터만, 내부 로직 설명 없음).

const PILL_BASE = 'https://apis.data.go.kr/1471000';

// ---------- fetch / 유틸 ----------

export async function fetchWithKey(path, params) {
  const key = process.env.DATA_API_KEY;
  if (!key) throw new Error('DATA_API_KEY 누락');
  const url = new URL(PILL_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  url.searchParams.set('type', 'json');
  // 포털 키가 이미 % 인코딩돼 있으면 searchParams.set이 한 번 더 인코딩해서 400이 난다
  const encodedKey = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
  const full = `${url.origin}${url.pathname}?serviceKey=${encodedKey}&${url.searchParams.toString()}`;
  const res = await fetch(full);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`공공데이터 호출 실패: ${res.status} ${txt}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`공공데이터 응답 JSON 아님: ${text.slice(0, 180)}`);
  }
}

function getNested(data, ...keys) {
  let cur = data;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}
function pickItems(data, opName) {
  const items =
    getNested(data, 'body', 'items') ??
    getNested(data, 'response', 'body', 'items') ??
    getNested(data, opName, 'itemList') ??
    [];
  if (Array.isArray(items)) return items;
  if (items && Array.isArray(items.item)) return items.item;
  if (items && typeof items === 'object' && (items.ITEM_NAME || items.itemName)) {
    return [items];
  }
  return [];
}

// ---------- 화면·로그용 한글 툴 이름 ----------

export const TOOL_LABEL = {
  lookup_drug: 'e약은요',
  dur_duplicate: 'DUR 효능군 중복',
  dur_contraindication: 'DUR 병용금기',
  dur_elderly: 'DUR 노인주의',
  pill_identify: '낱알식별',
  department_rules: '진료과 규칙표',
};

// ---------- Solar function calling용 툴 정의 ----------

const TOOL_FUNCTIONS = [
  {
    name: 'lookup_drug',
    description: '제품명 또는 브랜드(예: 타이레놀, 아스피린정)로 e약은요에서 조회한다. 일상어는 넣지 않는다. 증상만 말한 경우에는 호출하지 않는다.',
    parameters: {
      type: 'object',
      properties: { itemName: { type: 'string', description: '약 이름' } },
      required: ['itemName'],
    },
  },
  {
    name: 'dur_duplicate',
    description: '복용 중인 약 목록(성분명 또는 상품명)으로 DUR 효능군 중복을 조회한다. 약 이름 배열을 받는다.',
    parameters: {
      type: 'object',
      properties: { med_names: { type: 'array', items: { type: 'string' } } },
      required: ['med_names'],
    },
  },
  {
    name: 'dur_contraindication',
    description: '복용 중인 약 목록으로 DUR 병용금기를 조회한다. 약 이름 배열을 받는다.',
    parameters: {
      type: 'object',
      properties: { med_names: { type: 'array', items: { type: 'string' } } },
      required: ['med_names'],
    },
  },
  {
    name: 'dur_elderly',
    description: '65세 이상 환자의 복용 약 목록으로 DUR 노인주의 정보를 조회한다. 약 이름 배열과 만 나이를 받는다.',
    parameters: {
      type: 'object',
      properties: {
        med_names: { type: 'array', items: { type: 'string' } },
        age: { type: 'integer', description: '만 나이' },
      },
      required: ['med_names', 'age'],
    },
  },
  {
    name: 'pill_identify',
    description:
      '사용자가 약 이름을 모르겠다고 하거나, 이름을 알려달라고/찾아달라고 분명히 말했을 때만 호출한다. 예: "이름 몰라요", "약 이름이 뭐예요", "모양으로 찾아줘". 두통·발열 같은 증상만 말한 경우, "하얀 알약"만 말한 경우, "잘 모르겠어"로 건너뛸 때는 호출하지 않는다. 호출하면 모양·색·각인 선택 화면이 열린다.',
    parameters: {
      type: 'object',
      properties: {
        shape: { type: 'string', description: '원형, 타원, 장방형, 삼각형, 사각형. 일상어 금지' },
        color: { type: 'string', description: '하양, 노랑, 주황, 분홍, 빨강, 파랑, 초록, 보라. "하얀 알약" 금지' },
        imprint: { type: 'string', description: '알약에 새겨진 글자. 없으면 생략' },
      },
      required: [],
    },
  },
  {
    name: 'department_rules',
    description: '부위(body_part)와 증상(symptom)으로 진료과 1~3위를 규칙표로 산출한다. 부위와 증상 문자열을 받는다.',
    parameters: {
      type: 'object',
      properties: {
        body_part: { type: 'string' },
        symptom: { type: 'string' },
      },
      required: ['body_part', 'symptom'],
    },
  },
];

// ---------- 툴 맵: 실제 실행 함수 ----------

export async function lookupDrug(args) {
  const data = await fetchWithKey(
    '/DrbEasyDrugInfoService/getDrbEasyDrugList',
    { itemName: args.itemName || '' }
  );
  const items = pickItems(data, 'getDrbEasyDrugList');
  const list = Array.isArray(items)
    ? items.slice(0, 5).map((it) => ({ itemName: it.itemName, entName: it.entName }))
    : [];
  return { ok: true, result: { items: list, empty: list.length === 0 } };
}

export async function durDuplicate(args) {
  const effectMap = new Map();
  const meds = Array.isArray(args.med_names) ? args.med_names : [];
  for (const med of meds) {
    try {
      const data = await fetchWithKey(
        '/DURPrdlstInfoService03/getEfcyDplctInfoList03',
        { itemName: med }
      );
      const list = pickItems(data, 'getEfcyDplctInfoList03');
      if (Array.isArray(list)) {
        for (const row of list) {
          const eff = row.EFFECT_NAME || row.effectName || row.효능군 || '';
          if (eff) {
            if (!effectMap.has(eff)) effectMap.set(eff, []);
            effectMap.get(eff).push({ med, row });
          }
        }
      }
    } catch {}
  }
  const duplicates = [];
  for (const [eff, entries] of effectMap.entries()) {
    if (entries.length >= 2) {
      duplicates.push({ effect_name: eff, meds: entries.map((e) => e.med) });
    }
  }
  return { ok: true, result: { duplicates } };
}

export async function durContraindication(args) {
  const meds = Array.isArray(args.med_names) ? args.med_names : [];
  const contraPairs = [];
  const allRows = [];
  for (const med of meds) {
    try {
      const data = await fetchWithKey(
        '/DURPrdlstInfoService03/getUsjntTabooInfoList03',
        { itemName: med }
      );
      const list = pickItems(data, 'getUsjntTabooInfoList03');
      if (Array.isArray(list)) {
        for (const row of list) {
          allRows.push({ med, row });
        }
      }
    } catch {}
  }
  for (let i = 0; i < allRows.length; i++) {
    for (let j = i + 1; j < allRows.length; j++) {
      const r1 = allRows[i].row;
      const r2 = allRows[j].row;
      const mix1 = r1.MIXTURE_INGR_CODE || r1.mixtureIngredientCode;
      const mix2 = r2.MIXTURE_INGR_CODE || r2.mixtureIngredientCode;
      const ingr1 = r1.INGR_CODE || r1.ingredientCode;
      const ingr2 = r2.INGR_CODE || r2.ingredientCode;
      let matched = false;
      if (mix1 && ingr2 && String(mix1) === String(ingr2)) matched = true;
      if (mix2 && ingr1 && String(mix2) === String(ingr1)) matched = true;
      if (matched) {
        const reason =
          r1.PROHBT_CONTENT || r2.PROHBT_CONTENT || r1.prohbtnContent || r2.prohbtnContent || '';
        contraPairs.push({ med_a: allRows[i].med, med_b: allRows[j].med, reason });
      }
    }
  }
  return { ok: true, result: { contra_pairs: contraPairs } };
}

export async function durElderly(args) {
  const age = Number(args.age);
  if (!age || age < 65) return { ok: true, result: { cautions: [] } };
  const meds = Array.isArray(args.med_names) ? args.med_names : [];
  const cautions = [];
  for (const med of meds) {
    try {
      const data = await fetchWithKey(
        '/DURPrdlstInfoService03/getOdsnAtentInfoList03',
        { itemName: med }
      );
      for (const row of pickItems(data, 'getOdsnAtentInfoList03').slice(0, 5)) {
        cautions.push({
          med: row.ITEM_NAME || row.itemName || med,
          detail: row.PROHBT_CONTENT || row.REMK || '',
        });
      }
    } catch {}
  }
  return { ok: true, result: { cautions } };
}

const FINDER_SHAPE = {
  circle: '원형', oval: '타원', oblong: '장방형', triangle: '삼각형', square: '사각형',
  원형: '원형', 타원: '타원', 타원형: '타원', 장방형: '장방형', 삼각형: '삼각형', 사각형: '사각형',
};
const FINDER_COLOR = {
  white: '하양', yellow: '노랑', orange: '주황', pink: '분홍', red: '빨강',
  blue: '파랑', green: '초록', purple: '보라',
  하양: '하양', 흰색: '하양', 하얀: '하양', 노랑: '노랑', 주황: '주황',
  분홍: '분홍', 빨강: '빨강', 파랑: '파랑', 초록: '초록', 보라: '보라',
};

export function pillFinderPrefill(args = {}) {
  const shape = FINDER_SHAPE[args.shape] || '';
  const color = FINDER_COLOR[args.color] || '';
  const imprint = typeof args.imprint === 'string' ? args.imprint.trim() : '';
  return { shape, color, imprint };
}

export async function queryPillIdentify(args) {
  const prefill = pillFinderPrefill(args);
  const shape = prefill.shape === '타원' ? '타원형' : prefill.shape;
  const color = prefill.color;
  const imprint = prefill.imprint;
  if (!shape && !color && !imprint) {
    return { ok: true, result: { candidates: [], count: 0, ...prefill } };
  }

  const seen = new Set();
  const candidates = [];

  function consider(row) {
    if (!row || candidates.length >= 5) return;
    const name = row.ITEM_NAME || row.itemName || '';
    const maker = row.ENTP_NAME || row.entpName || '';
    const rowShape = row.DRUG_SHAPE || row.drugShape || '';
    const rowColor = row.COLOR_CLASS1 || row.colorClass1 || '';
    const rowImprint = [row.PRINT_FRONT || row.printFront, row.PRINT_BACK || row.printBack]
      .filter(Boolean)
      .join(' ');
    if (shape) {
      const want = shape === '타원' ? '타원형' : shape;
      const got = rowShape === '타원' ? '타원형' : rowShape;
      if (got && got !== want) return;
    }
    if (color && rowColor && !String(rowColor).includes(color)) return;
    if (imprint) {
      const needle = imprint.replace(/\s+/g, '').toUpperCase();
      const hay = `${rowImprint} ${name}`.replace(/\s+/g, '').toUpperCase();
      if (!hay.includes(needle)) return;
    }
    const key = `${name}|${maker}`;
    if (!name || seen.has(key)) return;
    seen.add(key);
    candidates.push({
      name,
      maker,
      shape: rowShape,
      color: rowColor,
      imprint: row.PRINT_FRONT || row.printFront || '',
      image: row.ITEM_IMAGE || row.itemImage || row.BIG_PRDT_IMG_URL || '',
    });
  }

  // v03는 모양·색 요청 파라미터가 없고 item_name만 필터된다
  if (imprint && /[가-힣]/.test(imprint)) {
    const named = await fetchWithKey(
      '/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03',
      { item_name: imprint, numOfRows: 10, pageNo: 1 },
    );
    for (const row of pickItems(named, 'getMdcinGrnIdntfcInfoList03')) consider(row);
  }

  for (let page = 1; page <= 2 && candidates.length < 5; page++) {
    const data = await fetchWithKey(
      '/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03',
      { numOfRows: 100, pageNo: page },
    );
    for (const row of pickItems(data, 'getMdcinGrnIdntfcInfoList03')) {
      consider(row);
      if (candidates.length >= 5) break;
    }
  }

  return { ok: true, result: { candidates, count: candidates.length, ...prefill } };
}

export async function pillIdentify(args) {
  // agent 툴은 카드만 연다. 공공데이터 조회는 프론트 카드 → /api/pill.
  const prefill = pillFinderPrefill(args);
  return {
    ok: true,
    result: {
      open_ui: true,
      ...prefill,
      candidates: [],
      count: 0,
    },
  };
}

export async function departmentRules(args) {
  const { getDepartmentTop3 } = await import('./departments.js');
  const top3 = getDepartmentTop3(args.body_part, args.symptom);
  return { ok: true, result: { department_top3: top3 } };
}

// TOOL_MAP: 키는 TOOL_DEFS name과 동일. turn.js에서 Solar function calling 결과에 따라 부름.
export const TOOL_MAP = {
  lookup_drug: lookupDrug,
  dur_duplicate: durDuplicate,
  dur_contraindication: durContraindication,
  dur_elderly: durElderly,
  pill_identify: pillIdentify,
  department_rules: departmentRules,
};
export const TOOL_DEFS = TOOL_FUNCTIONS.map((f) => ({ type: 'function', function: f }));