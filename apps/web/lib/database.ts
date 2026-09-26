import { loadRuntimeConfig } from "@commandry/config";
import { createDatabase } from "@commandry/db";

let connection: ReturnType<typeof createDatabase> | undefined;

export function getDatabase() {
  if (!connection) {
    const config = loadRuntimeConfig();
    connection = createDatabase({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
    });
  }
  return connection;
}
