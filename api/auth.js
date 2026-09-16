// api/auth.js — Supabase Auth REST 중계 (가입, 로그인, 토큰 갱신)
// 프론트가 anon 키를 직접 쓰지 않도록 /api가 중계한다.
// 돌려주는 건 access_token, refresh_token, 만료 시간만. 키 값은 절대 프론트로 안 나간다.
// 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY (Vercel 설정, 로컬은 .env.local)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase-env.js';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  };
}

// Supabase Auth 에러 본문에서 사람이 읽을 메시지만 뽑는다. 키나 내부 정보는 그대로 넘기지 않는다
function authErrorMessage(status, text) {
  let code = '';
  try {
    const j = JSON.parse(text);
    code = j.error_code || j.error || j.msg || '';
  } catch {
    code = '';
  }
  if (code === 'invalid_credentials') return '이메일이나 비밀번호가 맞지 않아요.';
  if (code === 'email_address_invalid') return '쓸 수 없는 이메일 주소예요.';
  if (code === 'user_already_exists' || code === 'email_exists') return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (code === 'weak_password') return '비밀번호가 너무 짧아요. 6자 이상으로 해 주세요.';
  if (code === 'over_email_send_rate_limit') return '메일을 너무 자주 보냈어요. 잠시 뒤 다시 해 주세요.';
  if (code === 'email_not_confirmed') return '가입 확인 메일의 링크를 먼저 눌러 주세요.';
  return `인증 요청이 거절됐어요 (${status}).`;
}

async function callAuth(path, payload) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { res, data, text };
}

function tokensOf(data) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? null,
  };
}

export async function POST(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ ok: false, error: '회원 기능이 아직 설정되지 않았어요.' }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: '요청 본문이 JSON이 아니에요.' }, 400);
  }

  const { action, email, password, refreshToken } = body || {};
  if (!action) return json({ ok: false, error: 'action이 필요해요 (signup, signin, refresh).' }, 400);

  try {
    if (action === 'signup' || action === 'signin') {
      if (!email || !password) return json({ ok: false, error: '이메일과 비밀번호가 필요해요.' }, 400);
      const path = action === 'signup' ? '/signup' : '/token?grant_type=password';
      const { res, data, text } = await callAuth(path, { email, password });
      if (!res.ok) {
        const status = res.status === 400 && action === 'signin' ? 401 : res.status >= 500 ? 502 : res.status;
        return json({ ok: false, action, error: authErrorMessage(res.status, text) }, status);
      }
      // 이메일 확인이 켜진 프로젝트는 가입 직후 토큰이 없다. 실패가 아니라 "메일 확인 필요"로 알린다
      if (!data || !data.access_token || !data.refresh_token) {
        return json({
          ok: true,
          action,
          needsConfirmation: true,
          message: '가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.',
        });
      }
      return json({ ok: true, action, ...tokensOf(data) });
    }

    if (action === 'refresh') {
      if (!refreshToken) return json({ ok: false, error: 'refreshToken이 필요해요.' }, 400);
      const { res, data, text } = await callAuth('/token?grant_type=refresh_token', { refresh_token: refreshToken });
      if (!res.ok || !data || !data.access_token) {
        return json({ ok: false, action, error: authErrorMessage(res.status, text) }, res.ok ? 401 : (res.status >= 500 ? 502 : 401));
      }
      return json({ ok: true, action, ...tokensOf(data) });
    }

    return json({ ok: false, error: `알 수 없는 action: ${action}` }, 400);
  } catch (err) {
    console.error('[api/auth] 오류:', err && err.message ? err.message : err);
    return json({ ok: false, error: '인증 서버와 통신이 안 돼요. 잠시 뒤 다시 해 주세요.' }, 502);
  }
}
