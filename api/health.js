// api/health.js — GET /api/health
// 패키지 없이. Vercel Node.js 함수(ESM). 내장 fetch만 사용.
// 환경변수: UPSTAGE_API_KEY, DATA_API_KEY.
// 키 설정 여부와 가벼운 연결 확인.

export async function GET() {
  const solarKey = process.env.UPSTAGE_API_KEY;
  const pillKey = process.env.DATA_API_KEY;

  const checks = {
    solar: 'no_key',
    pill_api: 'no_key',
  };

  if (solarKey && typeof solarKey === 'string' && solarKey.length > 0) {
    checks.solar = 'ok';
  }

  if (pillKey && typeof pillKey === 'string' && pillKey.length > 0) {
    checks.pill_api = 'ok';
  }

  return new Response(
    JSON.stringify({
      ok: true,
      checks,
      note: checks.solar === 'ok' && checks.pill_api === 'ok' ? '준비됨' : '키 없음/오류',
    }, null, 2),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
