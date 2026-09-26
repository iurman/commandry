#!/usr/bin/env bash
set -Eeuo pipefail

: "${DB_NAME:?}"
: "${DB_APP_PASSWORD:?}"
: "${DB_MIGRATION_PASSWORD:?}"

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv db_name DB_NAME
\getenv app_password DB_APP_PASSWORD
\getenv migration_password DB_MIGRATION_PASSWORD

CREATE ROLE commandry_migrate LOGIN PASSWORD :'migration_password';
CREATE ROLE commandry_app LOGIN PASSWORD :'app_password';

REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO commandry_migrate, commandry_app;
GRANT CREATE ON DATABASE :"db_name" TO commandry_migrate;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO commandry_migrate;
GRANT USAGE ON SCHEMA public TO commandry_app;

CREATE SCHEMA pgboss AUTHORIZATION commandry_migrate;
GRANT USAGE ON SCHEMA pgboss TO commandry_app;

ALTER DEFAULT PRIVILEGES FOR ROLE commandry_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO commandry_app;
ALTER DEFAULT PRIVILEGES FOR ROLE commandry_migrate IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO commandry_app;
ALTER DEFAULT PRIVILEGES FOR ROLE commandry_migrate IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO commandry_app;
ALTER DEFAULT PRIVILEGES FOR ROLE commandry_migrate IN SCHEMA pgboss
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO commandry_app;
ALTER DEFAULT PRIVILEGES FOR ROLE commandry_migrate IN SCHEMA pgboss
  GRANT USAGE ON SEQUENCES TO commandry_app;
ALTER DEFAULT PRIVILEGES FOR ROLE commandry_migrate IN SCHEMA pgboss
  GRANT EXECUTE ON FUNCTIONS TO commandry_app;
SQL
