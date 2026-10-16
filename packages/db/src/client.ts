import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as foundationSchema from "./foundation-schema";
import * as foundationEvaluationSchema from "./foundation-evaluation-schema";
import * as foundationImportSchema from "./foundation-import-schema";

export function createDatabase(options: {
  connectionString: string;
  max?: number;
}) {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 5,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle({
    client: pool,
    schema: {
      ...schema,
      ...foundationSchema,
      ...foundationEvaluationSchema,
      ...foundationImportSchema,
    },
  });
  return { db, pool, close: () => pool.end() };
}

export type CommandryDatabase = ReturnType<typeof createDatabase>["db"];
