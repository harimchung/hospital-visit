// api/_lib/tools.js
// 툴 정의(6개), 툴 맵(6개), 공공데이터 fetch·유틸, 조회 함수.
// TOOL_DEFS 이름은 영문만(lookup_drug, dur_duplicate, dur_contraindication, dur_elderly, pill_identify, department_rules).
// 화면·로그 표시용 한글 툴 이름은 TOOL_LABEL로 분리.
// description은 SKILL.md 약 API 절차 규칙 기반(요청 파라미터만, 내부 로직 설명 없음).

const PILL_BASE = 'https://apis.data.go.kr/1471000';

// ---------- fetch / 유틸 ----------

async function fetchWithKey(path, params) {
  const url = new URL(PILL_BASE + path);
  url.searchParams.set('serviceKey', process.env.DATA_API_KEY);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  url.searchParams.set('type', 'json');
  const res = await fetch(url.toString());
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`공공데이터 호출 실패: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data;
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
    description: '약 이름(성분명 또는 상품명)을 받아 e약은요 공공데이터에서 제품 정보를 조회한다. 약 이름 하나만 받는다.',
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
    description: '낱알식별: 모양·색·각인 중 일부 또는 전부를 받아 공공데이터에서 후보 약을 조회한다. 일부 파라미터만 있어도 호출 가능.',
    parameters: {
      type: 'object',
      properties: {
        shape: { type: 'string' },
        color: { type: 'string' },
        imprint: { type: 'string' },
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

export async function pillIdentify(args) {
  const shapeMap = {
    circle: '원형', oval: '타원형', oblong: '장방형', triangle: '삼각형', square: '사각형',
    원형: '원형', 타원: '타원형', 타원형: '타원형', 장방형: '장방형', 삼각형: '삼각형', 사각형: '사각형',
  };
  const colorMap = {
    white: '하양', yellow: '노랑', orange: '주황', pink: '분홍', red: '빨강', blue: '파랑', green: '초록', purple: '보라',
    하양: '하양', 흰색: '하양', 노랑: '노랑', 주황: '주황', 분홍: '분홍', 빨강: '빨강', 파랑: '파랑', 초록: '초록', 보라: '보라',
  };
  const shape = shapeMap[args.shape] || '';
  const color = colorMap[args.color] || '';
  const imprint = args.imprint || '';
  if (!shape && !color && !imprint) {
    return { ok: true, result: { candidates: [], count: 0 } };
  }
  const data = await fetchWithKey(
    '/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03',
    {
      drug_shape: shape || undefined,
      color_class1: color || undefined,
      print_front: imprint || undefined,
      numOfRows: 5,
      pageNo: 1,
    }
  );
  const candidates = pickItems(data, 'getMdcinGrnIdntfcInfoList03')
    .slice(0, 5)
    .map((row) => ({
      name: row.ITEM_NAME || '',
      maker: row.ENTP_NAME || '',
      shape: row.DRUG_SHAPE || '',
      color: row.COLOR_CLASS1 || '',
      imprint: row.PRINT_FRONT || '',
    }));
    return { ok: true, result: { candidates, count: candidates.length } };
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