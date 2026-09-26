import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client";

/** Applies only committed Drizzle SQL migrations with a separate DDL role. */
export async function migrateDatabase(options: {
  connectionString: string;
  migrationsDir?: string;
}): Promise<void> {
  const database = createDatabase({
    connectionString: options.connectionString,
    max: 1,
  });
  try {
    await migrate(database.db, {
      migrationsFolder:
        options.migrationsDir ??
        resolve(process.cwd(), "packages/db/migrations"),
    });
  } finally {
    await database.close();
  }
}
