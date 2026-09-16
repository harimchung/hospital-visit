// api/records.js — 진료 기록 저장, 목록, 상세, 삭제 (Supabase PostgREST 중계, RLS 적용)
// GET    /api/records          목록 (평문 라벨만, 암호문 제외)
// GET    /api/records?id=<uuid> 한 건 (암호문 포함, 복호화는 브라우저가 한다)
// POST   /api/records          저장 (user_id는 서버가 JWT에서 채운다)
// DELETE /api/records?id=<uuid> 삭제
// 프론트가 보낸 Authorization Bearer 토큰을 그대로 PostgREST에 넘긴다. RLS가 auth.uid()로 자기 행만 허용한다.
// service_role 키는 쓰지 않는다. 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase-env.js';

const TABLE = 'health_records';
const LIST_COLUMNS = 'id,date_label,body_part_label,profile_id,created_at,updated_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bearerOf(req) {
  const raw = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

// JWT 서명 검증은 PostgREST가 한다. 여기서는 user_id 채우기용으로 sub만 읽는다
function subOf(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function pgHeaders(token, extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function pg(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, text };
}

function pgFailure(res, text, what) {
  console.error(`[api/records] ${what} 실패:`, res.status, text.slice(0, 300));
  if (res.status === 401 || res.status === 403) return json({ ok: false, error: '로그인이 만료됐어요. 다시 로그인해 주세요.' }, 401);
  return json({ ok: false, error: `${what}에 실패했어요 (${res.status}).` }, res.status >= 500 ? 502 : res.status);
}

function requireAuth(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { error: json({ ok: false, error: '회원 기능이 아직 설정되지 않았어요.' }, 503) };
  const token = bearerOf(req);
  const uid = token ? subOf(token) : null;
  if (!token || !uid) return { error: json({ ok: false, error: '로그인이 필요해요.' }, 401) };
  return { token, uid };
}

export async function GET(req) {
  const auth = requireAuth(req);
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get('id');

  try {
    if (id) {
      if (!UUID_RE.test(id)) return json({ ok: false, error: 'id 형식이 아니에요.' }, 400);
      const { res, data, text } = await pg(`${TABLE}?id=eq.${id}&select=*`, { headers: pgHeaders(auth.token) });
      if (!res.ok) return pgFailure(res, text, '기록 조회');
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return json({ ok: false, error: '기록이 없어요.' }, 404);
      return json({ ok: true, record: row });
    }
    const { res, data, text } = await pg(`${TABLE}?select=${LIST_COLUMNS}&order=created_at.desc&limit=100`, { headers: pgHeaders(auth.token) });
    if (!res.ok) return pgFailure(res, text, '기록 조회');
    return json({ ok: true, records: Array.isArray(data) ? data : [] });
  } catch (err) {
    console.error('[api/records] GET 오류:', err && err.message ? err.message : err);
    return json({ ok: false, error: '저장소와 통신이 안 돼요.' }, 502);
  }
}

export async function POST(req) {
  const auth = requireAuth(req);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: '요청 본문이 JSON이 아니에요.' }, 400);
  }
  const { encrypted_payload, date_label, body_part_label, profile_id } = body || {};
  if (typeof date_label !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date_label)) {
    return json({ ok: false, error: 'date_label은 YYYY-MM-DD 형식이어야 해요.' }, 400);
  }
  if (typeof encrypted_payload !== 'string' || !encrypted_payload) {
    return json({ ok: false, error: 'encrypted_payload(암호문)가 필요해요.' }, 400);
  }
  if (profile_id != null && !UUID_RE.test(String(profile_id))) {
    return json({ ok: false, error: 'profile_id 형식이 아니에요.' }, 400);
  }

  // user_id는 프론트가 아니라 서버가 JWT에서 채운다. 서명이 안 맞는 토큰이면 PostgREST가 401로 막는다
  const row = {
    user_id: auth.uid,
    date_label,
    body_part_label: body_part_label != null ? String(body_part_label) : null,
    encrypted_payload,
    profile_id: profile_id || null,
  };

  try {
    const { res, data, text } = await pg(TABLE, {
      method: 'POST',
      headers: pgHeaders(auth.token, { Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    if (!res.ok) return pgFailure(res, text, '기록 저장');
    // PostgREST는 배열로 돌려준다
    const saved = Array.isArray(data) ? data[0] : data;
    if (!saved) return json({ ok: false, error: '저장 응답을 읽지 못했어요.' }, 502);
    const { encrypted_payload: _omit, ...meta } = saved;
    return json({ ok: true, record: meta }, 201);
  } catch (err) {
    console.error('[api/records] POST 오류:', err && err.message ? err.message : err);
    return json({ ok: false, error: '저장소와 통신이 안 돼요.' }, 502);
  }
}

export async function DELETE(req) {
  const auth = requireAuth(req);
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !UUID_RE.test(id)) return json({ ok: false, error: 'id가 필요해요.' }, 400);
  try {
    const { res, data, text } = await pg(`${TABLE}?id=eq.${id}`, {
      method: 'DELETE',
      headers: pgHeaders(auth.token, { Prefer: 'return=representation' }),
    });
    if (!res.ok) return pgFailure(res, text, '기록 삭제');
    const deleted = Array.isArray(data) ? data.length : 0;
    if (deleted === 0) return json({ ok: false, error: '기록이 없어요.' }, 404);
    return json({ ok: true, deleted });
  } catch (err) {
    console.error('[api/records] DELETE 오류:', err && err.message ? err.message : err);
    return json({ ok: false, error: '저장소와 통신이 안 돼요.' }, 502);
  }
}
