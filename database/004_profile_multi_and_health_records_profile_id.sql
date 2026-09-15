-- 004_profile_multi_and_health_records_profile_id.sql
-- 계정당 여러 프로필 관리 + 진료 기록을 프로필에 연결.
-- 적용 순서: 001 → 002 → 003 → 004.

-- 1) profiles.user_id UNIQUE 해제 (제약조건 이름으로 DROP)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;

-- 2) health_records에 profile_id 추가 (nullable로 먼저 추가)
ALTER TABLE health_records
  ADD COLUMN profile_id UUID
  REFERENCES profiles(id) ON DELETE CASCADE;

-- 3) 기존 health_records 레코드에 profile_id 연결 (같은 user_id의 프로필 하나)
--    프로필이 아직 없는 계정의 기존 레코드는 NULL로 남는다.
UPDATE health_records hr
SET profile_id = sub.pid
FROM (
  SELECT p.id AS pid, p.user_id
  FROM profiles p
) sub
WHERE hr.user_id = sub.user_id
  AND hr.profile_id IS NULL;

-- 4) 이제 profile_id NOT NULL로 변경
ALTER TABLE health_records
  ALTER COLUMN profile_id SET NOT NULL;

-- 5) 프로필별 조회용 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_health_records_profile_id
  ON health_records(profile_id);

-- 프로필별 + 날짜 내림차순 조회가 많으면 아래도 추가
CREATE INDEX IF NOT EXISTS idx_health_records_profile_date
  ON health_records(profile_id, date_label DESC);
