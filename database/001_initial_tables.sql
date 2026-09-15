-- 001_initial_tables.sql
-- 회원 프로필, 진료 기록(방문 단위), 에이전트 로그 테이블 생성.
-- 모든 민감 데이터는 기기 AES-GCM 키로 암호화한 JSON을 encrypted_payload에 저장한다.
-- 평문 컬럼은 date_label, body_part_label만 허용(목록·타임라인 조사용).
-- profiles.user_id에는 UNIQUE 제약조건(profiles_user_id_key)을 걸어 둔다(004에서 해제).

-- 회원 프로필
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  encrypted_payload  TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_user_id_key UNIQUE (user_id)
);

-- 진료 기록(방문 단위)
CREATE TABLE IF NOT EXISTS health_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_label       DATE NOT NULL,
  body_part_label  TEXT,
  encrypted_payload TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 에이전트 로그(선택, 실패·예외 기록용. 없어도 서비스 동작에는 지장 없음)
CREATE TABLE IF NOT EXISTS agent_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      TEXT NOT NULL,
  turn_index      INT NOT NULL,
  event_type      TEXT NOT NULL,
  payload         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
