// api/records.js — 진료 기록 CRUD (Supabase PostgREST 중계, RLS 적용)
// GET: 회원의 기록 목록 조회
// POST: 새 기록 저장
// 프론트가 보낸 Authorization Bearer 토큰을 그대로 PostgREST에 전달한다.
// 서버는 encrypted_payload를 복호화하지 않는다(복호화 권한은 브라우저에만 있다).
// 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase-env.js';

const POSTGREST_BASE = `${SUPABASE_URL}/rest/v1`;
const TABLE = 'health_records';

// PostgREST 호출 공통 헤더
// apikey에는 서버 anon 키를, Authorization에는 프론트 JWT를 그대로 전달해야 RLS가 auth.uid()로 작동한다.
function postgrestHeaders(authorization) {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': authorization || `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

// JWT에서 sub(uid) 추출
function extractUid(authorization) {
  if (!authorization) return null;
  const match = authorization.match(/Bearer\s+([^,\s]+)/);
  if (!match) return null;
  const token = match[1];
  try {
    // JWT 페이로드는 base64url 인코딩된 중간 부분
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const raw = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(raw);
    return payload.sub || payload.user_id || null;
  } catch {
    return null;
  }
}

// GET /api/records — 기록 목록
export async function GET(req) {
  const authorization = req.headers.get('Authorization');
  const uid = extractUid(authorization);

  if (!uid) {
    return new Response(
      JSON.stringify({ ok: false, error: '인증이 필요합니다. 로그인 후 이용하세요.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // RLS 정책: user_id = auth.uid() → 본인 기록만 반환
  const headers = postgrestHeaders(authorization);
  const url = `${POSTGREST_BASE}/${TABLE}?select=id,date_label,body_part_label,created_at,updated_at&order=created_at.desc`;

  let res;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch (err) {
    console.error('[api/records] GET fetch 오류:', err);
    return new Response(
      JSON.stringify({ ok: false, error: '서버 통신 오류가 발생했습니다' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!res.ok) {
    const text = await res.text();
    console.error('[api/records] GET 오류 응답:', res.status, text);
    return new Response(
      JSON.stringify({ ok: false, error: `기록 조회 실패 (${res.status})` }),
      { status: res.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: '응답 파싱에 실패했습니다' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, records: data }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

// POST /api/records — 기록 저장
export async function POST(req) {
  const authorization = req.headers.get('Authorization');
  const uid = extractUid(authorization);

  if (!uid) {
    return new Response(
      JSON.stringify({ ok: false, error: '인증이 필요합니다. 로그인 후 이용하세요.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: '요청 본문이 JSON이 아닙니다' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { encrypted_payload, date_label, body_part_label, profile_id } = body;

  // 필수 필드 검사
  if (!date_label) {
    return new Response(
      JSON.stringify({ ok: false, error: 'date_label(날짜)이 필요합니다' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // encrypted_payload는 비어있을 수 없음(최소 빈 문자열이라도?)
  // 프론트가 암호화를 안 했거나 payload가 없으면 저장 의미가 없으므로 허용하되, 기본값 ''
  const payloadText = encrypted_payload != null ? String(encrypted_payload) : '';

  // INSERT용 데이터. user_id는 서버에서 JWT sub로 채운다(프론트가 보내면 안 됨).
  const insertData = {
    user_id: uid,
    date_label,
    body_part_label: body_part_label != null ? String(body_part_label) : '',
    encrypted_payload: payloadText,
    profile_id: profile_id || null,
  };

  const headers = postgrestHeaders(authorization);
  const url = `${POSTGREST_BASE}/${TABLE}`;
  const bodyStr = JSON.stringify(insertData);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyStr,
    });
  } catch (err) {
    console.error('[api/records] POST fetch 오류:', err);
    return new Response(
      JSON.stringify({ ok: false, error: '서버 통신 오류가 발생했습니다' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!res.ok) {
    const text = await res.text();
    console.error('[api/records] POST 오류 응답:', res.status, text);
    return new Response(
      JSON.stringify({ ok: false, error: `기록 저장 실패 (${res.status})` }),
      { status: res.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: '응답 파싱에 실패했습니다' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // encrypted_payload는 프론트만 복호화 가능하므로, 서버 응답에는 포함시키지 않는다
  // (필요하다면 프론트가 이미 알고 있으므로 제외)
  const record = {
    id: data.id,
    date_label: data.date_label,
    body_part_label: data.body_part_label,
    created_at: data.created_at,
    updated_at: data.updated_at,
    profile_id: data.profile_id,
  };

  return new Response(
    JSON.stringify({ ok: true, record }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
