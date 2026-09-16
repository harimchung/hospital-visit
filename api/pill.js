// api/pill.js — POST /api/pill (패키지 없이, 내장 fetch)
// 공공데이터포털 인증키 DATA_API_KEY 사용.

import { queryPillIdentify, fetchWithKey } from './_lib/tools.js';

function getNested(data, ...keys) {
  let cur = data;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const errors = [];
  if (!body || typeof body !== 'object') errors.push('body 객체 필요');
  const kind = body.kind;
  const allowed = ['drug_name', 'drug_dup', 'drug_contra', 'elderly_caution', 'pill_identify'];
  if (!kind || !allowed.includes(kind)) errors.push('kind 필요(' + allowed.join(',') + ')');
  if (!body.params || typeof body.params !== 'object') errors.push('params 필요');
  if (errors.length) {
    return new Response(JSON.stringify({ ok: false, error: errors.join('; ') }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const params = body.params;

  try {
    let result;
    switch (kind) {
      case 'drug_name': {
        const data = await fetchWithKey(
          '/DrbEasyDrugInfoService/getDrbEasyDrugList',
          { itemName: params.itemName || '' }
        );
        const items = getNested(data, 'getDrbEasyDrugList', 'itemList') || [];
        const list = Array.isArray(items)
          ? items.slice(0, 5).map((it) => ({
              itemName: it.itemName,
              entName: it.entName,
            }))
          : [];
        result = {
          items: list,
          empty: list.length === 0,
        };
        break;
      }
      case 'drug_dup': {
        const effectMap = new Map();
        const meds = Array.isArray(params.med_names) ? params.med_names : [];
        for (const med of meds) {
          try {
            const data = await fetchWithKey(
              '/DURPrdlstInfoService03/getEfcyDplctInfoList03',
              { itemName: med }
            );
            const list = getNested(data, 'getEfcyDplctInfoList03', 'itemList') || [];
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
        result = { duplicates };
        break;
      }
      case 'drug_contra': {
        const meds = Array.isArray(params.med_names) ? params.med_names : [];
        const contraPairs = [];
        const allRows = [];
        for (const med of meds) {
          try {
            const data = await fetchWithKey(
              '/DURPrdlstInfoService03/getUsjntTabooInfoList03',
              { itemName: med }
            );
            const list = getNested(data, 'getUsjntTabooInfoList03', 'itemList') || [];
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
              const reason = r1.PROHBT_CONTENT || r2.PROHBT_CONTENT || r1.prohbtnContent || r2.prohbtnContent || '';
              contraPairs.push({
                med_a: allRows[i].med,
                med_b: allRows[j].med,
                reason: reason,
              });
            }
          }
        }
        result = { contra_pairs: contraPairs };
        break;
      }
      case 'elderly_caution': {
        const age = Number(params.age);
        if (!age || age < 65) {
          result = { cautions: [] };
          break;
        }
        const data = await fetchWithKey(
          '/DURPrdlstInfoService03/getOdsnAtentInfoList03',
          { itemName: params.med_names?.[0] || '' }
        );
        const list = getNested(data, 'getOdsnAtentInfoList03', 'itemList') || [];
        const cautions = Array.isArray(list)
          ? list.slice(0, 5).map((row) => ({
              med: row.itemName || row.ITEM_NAME || '',
              detail: row.ODSNC_ATNT_CONTENT || row.odsnAtntContent || '',
            }))
          : [];
        result = { cautions };
        break;
      }
      case 'pill_identify': {
        const out = await queryPillIdentify(params);
        if (!out.ok) throw new Error(out.error || '낱알식별 실패');
        result = out.result;
        break;
      }
      default: {
        return new Response(JSON.stringify({ ok: false, error: '지원하지 않는 kind' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        kind,
        result,
        source_note: '식품의약품안전처 공공데이터 (공공데이터포털)',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: msg,
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
