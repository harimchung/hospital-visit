// api/_lib/supabase-env.js
// Supabase 연결에 필요한 환경변수를 한 곳에서 제공한다.
// Vercel 환경변수 또는 로컬 .env.local 에서 읽는다.
// 브라우저 코드에 노출되지 않도록 /api 내부에서만 사용한다.

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
