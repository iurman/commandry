import { eq, sql } from "drizzle-orm";
import { PgBoss, fromDrizzle } from "pg-boss";
import { Pool } from "pg";
import type { CommandryDatabase } from "@commandry/db";
import { schema } from "@commandry/db";
import type { SyntheticRun } from "@commandry/domain";

export const SYNTHETIC_QUEUE = "commandry-synthetic-v1";
export const SYNTHETIC_DEAD_LETTER_QUEUE = "commandry-synthetic-dlq";

function bossOptions(connectionString: string, max: number, migrate: boolean) {
  return {
    connectionString,
    max,
    migrate,
    supervise: true,
    schedule: false,
  } as const;
}

/** Runs in the one-shot DDL process, not in web or worker startup. */
export async function installPgBossSchema(options: {
  connectionString: string;
  runtimeRole: string;
}): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(options.runtimeRole)) {
    throw new Error("runtimeRole must be a simple PostgreSQL role name");
  }
  const boss = new PgBoss(bossOptions(options.connectionString, 1, true));
  await boss.start();
  try {
    await boss.createQueue(SYNTHETIC_DEAD_LETTER_QUEUE);
    await boss.createQueue(SYNTHETIC_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: SYNTHETIC_DEAD_LETTER_QUEUE,
    });
  } finally {
    await boss.stop();
  }

  const pool = new Pool({ connectionString: options.connectionString, max: 1 });
  const role = `"${options.runtimeRole}"`;
  try {
    await pool.query(`GRANT USAGE ON SCHEMA pgboss TO ${role}`);
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT EXECUTE ON FUNCTIONS TO ${role}`,
    );
  } finally {
    await pool.end();
  }
}

/** Producer startup has no schema mutation and uses a separate bounded pool. */
export async function createPgBossProducer(options: {
  connectionString: string;
  max?: number;
}) {
  const boss = new PgBoss(
    bossOptions(options.connectionString, options.max ?? 2, false),
  );
  await boss.start();
  return { boss, close: () => boss.stop() };
}

/** Application submission port: the product row and job commit or roll back together. */
export function createSyntheticRunSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  return {
    async submitOnce(occurrenceId: string): Promise<SyntheticRun> {
      return db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.syntheticRun)
          .values({
            id: crypto.randomUUID(),
            occurrenceId,
            state: "queued",
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          const jobId = await boss.send(
            SYNTHETIC_QUEUE,
            {
              version: 1,
              runId: inserted.id,
              occurrenceId,
            },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId) throw new Error("Synthetic job was not enqueued");
          await tx.insert(schema.auditEvent).values({
            id: crypto.randomUUID(),
            actor: "system:api",
            operation: "synthetic_run.queued",
            targetRunId: inserted.id,
            details: { jobId },
          });
          return inserted;
        }

        const [existing] = await tx
          .select()
          .from(schema.syntheticRun)
          .where(eq(schema.syntheticRun.occurrenceId, occurrenceId))
          .limit(1);
        if (!existing)
          throw new Error("Synthetic occurrence was not found after conflict");
        return existing;
      });
    },
  };
}
