-- 003_updated_at_trigger.sql

-- 범용 updated_at 함수
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- profiles
DROP TRIGGER IF EXISTS set_updated_at_profiles ON profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- health_records
DROP TRIGGER IF EXISTS set_updated_at_records ON health_records;
CREATE TRIGGER set_updated_at_records
  BEFORE UPDATE ON health_records
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();
