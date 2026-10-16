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
  createFoundationWorkService,
  createKnowledgeAccessService,
} from "@commandry/application";
import { knowledgeTokenDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createFoundationWorkReadAccessRepository } from "./foundation-work-repository";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createKnowledgeAccessRepository } from "./knowledge-access-repository";
import { foundationByteDigest } from "./foundation-record-repository";
import { capture, knowledgeClient, knowledgeItem, project } from "./schema";
import { foundationConfiguration } from "./foundation-schema";
import { foundationImportRevision } from "./foundation-import-schema";

const ownerUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!ownerUrl || !runtimePassword)
  throw new Error("Use scripts/test-integration.mjs --foundation-only");

test(
  "populated 0057, 0059 and 0060 upgrades preserve canonical memory and exact grants, rerun safely and explicitly admit Work",
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
      // Populate the existing foundation BEFORE the selected-import migration.
      // This checks an actual 0059 database, as well as the retained 0057 records.
      const foundationPrefix = {
        ...journal,
        entries: journal.entries.filter((entry) => entry.idx <= 59),
      };
      await writeFile(
        join(fixtureDir, "meta/_journal.json"),
        JSON.stringify(foundationPrefix),
      );
      for (const entry of foundationPrefix.entries.filter(
        (entry) => entry.idx > 57,
      ))
        await copyFile(
          join(migrations, `${entry.tag}.sql`),
          join(fixtureDir, `${entry.tag}.sql`),
        );
      await migrateDatabase({
        connectionString: upgradeUrl.toString(),
        migrationsDir: fixtureDir,
      });
      const priorAccess = createFoundationAccessRepository(upgrade.db);
      const priorOwner = createFoundationOwnerService(
        priorAccess,
        {
          principalId: "user:upgrade-owner",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        { environment: "test" },
      );
      const priorMachine = createFoundationMachineService(priorAccess, {
        environment: "test",
      });
      const priorClient = await priorOwner.createClient(
        {
          name: "Retained pre-import foundation grant",
          projectId,
          environment: "test",
          operations: [
            "foundation.read",
            "evidence.record",
            "memory.propose",
            "memory.revise",
            "configuration.record",
            "evaluation.record",
          ],
          ttlSeconds: 3600,
        },
        "before-import-client",
      );
      const priorEvidence = await priorMachine.recordEvidence(
        priorClient.token,
        {
          projectId,
          sourceKind: "knowledge_revision",
          sourceId: knowledgeId,
          sourceVersion: "1",
          contentDigest: foundationByteDigest(text),
          locator: `commandry:knowledge/${knowledgeId}/versions/1`,
          observedAt: null,
          availability: "available",
        },
        "before-import-evidence",
      );
      const priorMemory = await priorMachine.proposeMemory(
        priorClient.token,
        {
          projectId,
          knowledgeItemId: knowledgeId,
          content: {
            statement: "Retained approved instruction before import support.",
            category: "instruction",
            evidenceIds: [priorEvidence.record.id],
            relatedMemoryIds: [],
            relationType: null,
          },
          alias: { namespace: "pre-import", externalId: "retained" },
        },
        "before-import-memory",
      );
      await priorOwner.reviewMemory(
        {
          projectId,
          memoryId: priorMemory.record.id,
          expectedVersion: 1,
          decision: "accepted",
          reason: "Synthetic upgrade owner review",
        },
        "before-import-review",
      );
      await priorOwner.verifyMemory(
        {
          projectId,
          memoryId: priorMemory.record.id,
          expectedVersion: 1,
          verification: "source_matched",
          evidenceIds: [priorEvidence.record.id],
          reason: "Synthetic exact source bytes",
        },
        "before-import-verify",
      );
      const priorApproval = await priorOwner.approveInstruction(
        {
          projectId,
          memoryId: priorMemory.record.id,
          expectedVersion: 1,
          contentDigest: priorMemory.record.contentDigest,
          disclosureProjectId: projectId,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
        "before-import-approval",
      );
      const frozenMemory = await priorMachine.getMemory(priorClient.token, {
        projectId,
        id: priorMemory.record.id,
      });
      const priorConfig = await priorMachine.recordConfiguration(
        priorClient.token,
        {
          projectId,
          kind: "prompt",
          content: "Retained configuration bytes before selected import.",
          parentIds: [],
          sourceCommit: null,
        },
        "before-import-config",
      );
      const frozenRows = await upgrade.pool.query(
        "select to_jsonb(r) as record from public.foundation_instruction_approval r where id = $1",
        [priorApproval.record.id],
      );
      // Exercise the populated 0060 boundary before the constraint-only 0061.
      const importPrefix = {
        ...journal,
        entries: journal.entries.filter((entry) => entry.idx <= 60),
      };
      await writeFile(
        join(fixtureDir, "meta/_journal.json"),
        JSON.stringify(importPrefix),
      );
      for (const entry of importPrefix.entries.filter(
        (entry) => entry.idx > 59,
      ))
        await copyFile(
          join(migrations, `${entry.tag}.sql`),
          join(fixtureDir, `${entry.tag}.sql`),
        );
      await migrateDatabase({
        connectionString: upgradeUrl.toString(),
        migrationsDir: fixtureDir,
      });
      const beforeWork = await upgrade.pool.query(
        "select operations from foundation_client where id = $1",
        [priorClient.client.id],
      );
      assert.deepEqual(
        beforeWork.rows[0]!.operations,
        priorClient.client.operations,
      );
      await assert.rejects(
        priorOwner.createClient(
          {
            name: "Work unavailable before 0061",
            projectId,
            environment: "test",
            operations: ["work.read"],
            ttlSeconds: 3600,
          },
          "before-work-migration",
        ),
        (error: unknown) => {
          let current = error;
          for (let depth = 0; depth < 8 && current instanceof Error; depth++) {
            const databaseError = current as Error & {
              code?: string;
              constraint?: string;
            };
            if (
              databaseError.code === "23514" &&
              databaseError.constraint === "foundation_client_operations_valid"
            )
              return true;
            current = current.cause;
          }
          return false;
        },
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
      await assert.rejects(
        runtime.db.select().from(foundationImportRevision),
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
      assert.deepEqual(
        await priorMachine.getMemory(priorClient.token, {
          projectId,
          id: priorMemory.record.id,
        }),
        frozenMemory,
      );
      assert.deepEqual(
        await priorMachine.getConfiguration(priorClient.token, {
          projectId,
          id: priorConfig.record.id,
        }),
        priorConfig.record,
      );
      assert.deepEqual(
        (await priorMachine.describe(priorClient.token, projectId)).actor
          .capabilities,
        priorClient.client.operations,
      );
      const retainedApproval = await upgrade.pool.query(
        "select to_jsonb(r) as record from public.foundation_instruction_approval r where id = $1",
        [priorApproval.record.id],
      );
      assert.deepEqual(retainedApproval.rows, frozenRows.rows);
      assert.deepEqual(
        await runtime.db.select().from(foundationImportRevision),
        [],
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
      const workClient = await owner.createClient(
        {
          name: "Explicit post-upgrade Work grant",
          projectId,
          environment: "test",
          operations: ["work.read"],
          ttlSeconds: 3600,
        },
        "upgrade-work-issue",
      );
      const work = createFoundationWorkService(
        createFoundationWorkReadAccessRepository(runtime.db),
        { environment: "test" },
      );
      assert.equal(
        (await work.listProjectWork(workClient.token, { projectId }))
          .consistency,
        "live",
      );
      await assert.rejects(
        work.listProjectWork(priorClient.token, { projectId }),
      );
      const afterWork = await upgrade.pool.query(
        "select operations from foundation_client where id = $1",
        [priorClient.client.id],
      );
      assert.deepEqual(
        afterWork.rows[0]!.operations,
        priorClient.client.operations,
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
