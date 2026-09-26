import { migrateDatabase } from "@commandry/db";
import { installPgBossSchema } from "@commandry/platform";

const connectionString = process.env.DATABASE_MIGRATION_URL;
if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
  console.error(
    "DATABASE_MIGRATION_URL must be a PostgreSQL URL for the one-shot migrator.",
  );
  process.exit(1);
}

await migrateDatabase({ connectionString });
await installPgBossSchema({ connectionString, runtimeRole: "commandry_app" });
console.log(
  JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    service: "migrate",
    operation: "schema.ready",
    schemaCompatibility: "1",
  }),
);
