import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  copyFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { eq, sql } from "drizzle-orm";
import {
  createFoundationMachineService,
  createFoundationOwnerService,
  createKnowledgeAccessService,
} from "@commandry/application";
import { knowledgeTokenDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createKnowledgeAccessRepository } from "./knowledge-access-repository";
import { foundationByteDigest } from "./foundation-record-repository";
import { capture, knowledgeClient, knowledgeItem, project } from "./schema";
import { foundationConfiguration } from "./foundation-schema";

const ownerUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!ownerUrl || !runtimePassword)
  throw new Error("Use scripts/test-integration.mjs --foundation-only");

test(
  "populated 0057 upgrade preserves canonical records and legacy grants, reruns safely and explicitly regrants new tables",
  { timeout: 60000 },
  async () => {
    const databaseName = `foundation_upgrade_${randomUUID().replaceAll("-", "")}`;
    const base = createDatabase({ connectionString: ownerUrl!, max: 1 });
    const upgradeUrl = new URL(ownerUrl!);
    upgradeUrl.pathname = `/${databaseName}`;
    const runtimeUrl = new URL(upgradeUrl);
    runtimeUrl.username = "commandry_app_integration";
    runtimeUrl.password = runtimePassword!;
    const fixtureDir = await mkdtemp(
      join(tmpdir(), "commandry-foundation-upgrade-"),
    );
    let upgrade: ReturnType<typeof createDatabase> | undefined;
    let runtime: ReturnType<typeof createDatabase> | undefined;
    let created = false;
    try {
      await base.pool.query(`CREATE DATABASE "${databaseName}"`);
      created = true;
      const migrations = resolve("packages/db/migrations");
      const journal = JSON.parse(
        await readFile(join(migrations, "meta/_journal.json"), "utf8"),
      ) as { entries: { idx: number; tag: string }[] };
      const prefix = {
        ...journal,
        entries: journal.entries.filter((entry) => entry.idx <= 57),
      };
      await mkdir(join(fixtureDir, "meta"));
      await writeFile(
        join(fixtureDir, "meta/_journal.json"),
        JSON.stringify(prefix),
      );
      for (const entry of prefix.entries)
        await copyFile(
          join(migrations, `${entry.tag}.sql`),
          join(fixtureDir, `${entry.tag}.sql`),
        );
      await migrateDatabase({
        connectionString: upgradeUrl.toString(),
        migrationsDir: fixtureDir,
      });
      upgrade = createDatabase({
        connectionString: upgradeUrl.toString(),
        max: 1,
      });
      const projectId = randomUUID();
      const captureId = randomUUID();
      const knowledgeId = randomUUID();
      const legacyId = randomUUID();
      const legacyToken = `ck_${"A".repeat(43)}`;
      const text = "Retained source before the foundation migration.";
      await upgrade.db
        .insert(project)
        .values({ id: projectId, name: "Populated upgrade fixture" });
      await upgrade.db.insert(capture).values({
        id: captureId,
        projectId,
        inputType: "text",
        originalContent: text,
      });
      await upgrade.db.insert(knowledgeItem).values({
        id: knowledgeId,
        projectId,
        sourceCaptureId: captureId,
        title: "Retained source",
        content: text,
      });
      await upgrade.db.insert(knowledgeClient).values({
        id: legacyId,
        name: "Existing read-only credential",
        projectId,
        tokenDigest: knowledgeTokenDigest(legacyToken),
        createdBy: "user:legacy-owner",
        expiresAt: new Date(Date.now() + 3600000),
      });
      await upgrade.pool.query(
        `GRANT CONNECT ON DATABASE "${databaseName}" TO commandry_app_integration`,
      );
      await upgrade.pool.query(
        "GRANT USAGE ON SCHEMA public TO commandry_app_integration",
      );
      await upgrade.pool.query(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO commandry_app_integration",
      );
      await migrateDatabase({ connectionString: upgradeUrl.toString() });
      await migrateDatabase({ connectionString: upgradeUrl.toString() });
      runtime = createDatabase({
        connectionString: runtimeUrl.toString(),
        max: 1,
      });
      // A realistic existing runtime role does not inherit privileges on a new table.
      await assert.rejects(
        runtime.db.select().from(foundationConfiguration),
        (error: unknown) =>
          error instanceof Error &&
          error.cause instanceof Error &&
          /permission denied/.test(error.cause.message),
      );
      await upgrade.pool.query(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO commandry_app_integration",
      );
      await upgrade.pool.query(
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO commandry_app_integration",
      );
      const [original] = await runtime.db
        .select()
        .from(knowledgeItem)
        .where(eq(knowledgeItem.id, knowledgeId));
      assert.equal(original!.content, text);
      assert.equal(original!.version, 1);
      const [legacy] = await runtime.db
        .select()
        .from(knowledgeClient)
        .where(eq(knowledgeClient.id, legacyId));
      assert.equal(legacy!.tokenDigest, knowledgeTokenDigest(legacyToken));
      assert.equal(legacy!.revokedAt, null);
      const oldService = createKnowledgeAccessService(
        createKnowledgeAccessRepository(runtime.db),
      );
      assert.equal(
        (await oldService.getBrief(legacyToken)).brief.project.id,
        projectId,
      );
      const access = createFoundationAccessRepository(runtime.db);
      const machine = createFoundationMachineService(access, {
        environment: "test",
      });
      await assert.rejects(machine.describe(legacyToken, projectId));
      const owner = createFoundationOwnerService(
        access,
        {
          principalId: "user:upgrade-owner",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        { environment: "test" },
      );
      const issued = await owner.createClient(
        {
          name: "Explicit new opt-in grant",
          projectId,
          environment: "test",
          operations: ["foundation.read", "evidence.record"],
          ttlSeconds: 3600,
        },
        "upgrade-issue",
      );
      const evidence = await machine.recordEvidence(
        issued.token,
        {
          projectId,
          sourceKind: "knowledge_revision",
          sourceId: knowledgeId,
          sourceVersion: "1",
          contentDigest: foundationByteDigest(text),
          locator: `commandry:knowledge/${knowledgeId}`,
          observedAt: null,
          availability: "available",
        },
        "upgrade-evidence",
      );
      assert.equal(evidence.record.verification, "unverified");
      assert.equal(
        (
          await machine.getEvidence(issued.token, {
            projectId,
            id: evidence.record.id,
          })
        ).contentDigest,
        foundationByteDigest(text),
      );
      const count = await upgrade.db.execute(
        sql`select count(*)::integer as count from drizzle.__drizzle_migrations`,
      );
      assert.equal(count.rows[0]!.count, journal.entries.length);
    } finally {
      await runtime?.close();
      await upgrade?.close();
      if (created)
        await base.pool.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      await base.close();
      await rm(fixtureDir, { recursive: true, force: true });
    }
  },
);
