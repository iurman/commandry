\getenv db_name DB_NAME

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commandry_backup') THEN
    CREATE ROLE commandry_backup LOGIN;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE :"db_name" TO commandry_backup;
GRANT pg_read_all_data TO commandry_backup;
