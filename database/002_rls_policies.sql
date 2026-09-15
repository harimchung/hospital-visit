-- 002_rls_policies.sql
-- RLS 켜기
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs           ENABLE ROW LEVEL SECURITY;

-- 생략: 서비스_role 키는 쓰지 않으므로 BYPASSRLS 관련 설정은 하지 않는다.

-- 프로필: 자기 것만
CREATE POLICY profiles_select  ON profiles FOR SELECT  USING (user_id = auth.uid());
CREATE POLICY profiles_insert  ON profiles FOR INSERT  WITH CHECK (user_id = auth.uid());
CREATE POLICY profiles_update  ON profiles FOR UPDATE  USING (user_id = auth.uid())
                                                         WITH CHECK (user_id = auth.uid());
CREATE POLICY profiles_delete  ON profiles FOR DELETE  USING (user_id = auth.uid());

-- 진료 기록: 자기 것만
CREATE POLICY records_select   ON health_records FOR SELECT  USING (user_id = auth.uid());
CREATE POLICY records_insert   ON health_records FOR INSERT  WITH CHECK (user_id = auth.uid());
CREATE POLICY records_update   ON health_records FOR UPDATE  USING (user_id = auth.uid())
                                                         WITH CHECK (user_id = auth.uid());
CREATE POLICY records_delete   ON health_records FOR DELETE  USING (user_id = auth.uid());

-- 에이전트 로그: 자기 것만(읽기만 허용해도 충분하나, 이관/delete를 위해 전체 정책)
CREATE POLICY logs_select      ON agent_logs FOR SELECT    USING (user_id = auth.uid());
CREATE POLICY logs_insert      ON agent_logs FOR INSERT    WITH CHECK (user_id = auth.uid());
CREATE POLICY logs_delete      ON agent_logs FOR DELETE    USING (user_id = auth.uid());
