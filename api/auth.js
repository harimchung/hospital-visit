// api/auth.js — Supabase Auth REST 중계 (가입/로그인/토큰 갱신)
// 프론트에서 anon 키를 직접 쓰지 않도록 /api가 중계한다.
// 반환값: access_token, refresh_token 만. 사용자 정보, 키 값은 프론트에 노출하지 않는다.
// 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY (Vercel 설정, 로컬은 .env.local)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY 환경변수가 필요합니다');
}

const AUTH_BASE = `${SUPABASE_URL}/auth/v1`;

// 공통 헤더
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

// 가입: POST /auth/v1/signup
export async function signup(email, password) {
  const res = await fetch(`${AUTH_BASE}/signup`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`가입 실패 (${res.status}): ${text}`);
  }

  const data = await res.json();
  return extractTokens(data);
}

// 로그인: POST /auth/v1/token?grant_type=password
export async function signin(email, password) {
  const res = await fetch(`${AUTH_BASE}/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`로그인 실패 (${res.status}): ${text}`);
  }

  const data = await res.json();
  return extractTokens(data);
}

// 토큰 갱신: POST /auth/v1/token?grant_type=refresh_token
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${AUTH_BASE}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`토큰 갱신 실패 (${res.status}): ${text}`);
  }

  const data = await res.json();
  return extractTokens(data);
}

// 응답에서 access_token, refresh_token만 추출
function extractTokens(data) {
  // signup/signin 응답 구조:
  //   { access_token, token_type, expires_in, refresh_token, user }
  // signup에서 이미 인증된 경우(user만 반환되는 경우)는 tokens 없음 → 에러
  if (!data.access_token || !data.refresh_token) {
    throw new Error('인증 토큰이 응답에 없습니다. 이메일 인증을 확인하세요.');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// Vercel 공개 엔드포인트: POST /api/auth (action 필드로 구분)
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: '요청 본문이 JSON이 아닙니다' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { action, email, password, refreshToken } = body;

  // 필수 필드 검사
  if (!action) {
    return new Response(
      JSON.stringify({ ok: false, error: 'action이 필요합니다 (signup | signin | refresh)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    let result;
    switch (action) {
      case 'signup':
        if (!email || !password) {
          return new Response(
            JSON.stringify({ ok: false, error: 'email과 password가 필요합니다' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        result = await signup(email, password);
        return new Response(
          JSON.stringify({ ok: true, action: 'signup', ...result }),
          { headers: { 'Content-Type': 'application/json' } }
        );

      case 'signin':
        if (!email || !password) {
          return new Response(
            JSON.stringify({ ok: false, error: 'email과 password가 필요합니다' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        result = await signin(email, password);
        return new Response(
          JSON.stringify({ ok: true, action: 'signin', ...result }),
          { headers: { 'Content-Type': 'application/json' } }
        );

      case 'refresh':
        if (!refreshToken) {
          return new Response(
            JSON.stringify({ ok: false, error: 'refreshToken이 필요합니다' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        result = await refreshAccessToken(refreshToken);
        return new Response(
          JSON.stringify({ ok: true, action: 'refresh', ...result }),
          { headers: { 'Content-Type': 'application/json' } }
        );

      default:
        return new Response(
          JSON.stringify({ ok: false, error: `알 수 없는 action: ${action}` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
  } catch (err) {
    console.error('[api/auth] 에러:', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message || '인증 처리 중 오류가 발생했습니다' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
