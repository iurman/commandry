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
  createFoundationResourceService,
  createFoundationTaskProposalService,
  createKnowledgeAccessService,
} from "@commandry/application";
import { knowledgeTokenDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createFoundationResourceReadAccessRepository } from "./foundation-resources-repository";
import { createFoundationWorkReadAccessRepository } from "./foundation-work-repository";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationTaskProposalAccessRepository } from "./foundation-task-proposal-repository";
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
  "populated 0057 through 0062 upgrades preserve canonical memory, triage and exact grants, rerun safely and explicitly admit Work, proposals and resource reads",
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
      const workPrefix = {
        ...journal,
        entries: journal.entries.filter((entry) => entry.idx <= 61),
      };
      await writeFile(
        join(fixtureDir, "meta/_journal.json"),
        JSON.stringify(workPrefix),
      );
      for (const entry of workPrefix.entries.filter((entry) => entry.idx > 60))
        await copyFile(
          join(migrations, `${entry.tag}.sql`),
          join(fixtureDir, `${entry.tag}.sql`),
        );
      await migrateDatabase({
        connectionString: upgradeUrl.toString(),
        migrationsDir: fixtureDir,
      });
      const legacyTaskCaptureId = randomUUID();
      const legacyTaskId = randomUUID();
      const legacySuggestionId = randomUUID();
      const legacyDecisionId = randomUUID();
      await upgrade.pool.query(
        "insert into capture(id,input_type,original_content,state,project_id,filed_record_kind,filed_record_id,filed_at) values($1,'text',$2,'filed',$3,'task',$4,now())",
        [
          legacyTaskCaptureId,
          "Retained local triage original before 0062.\r\n",
          projectId,
          legacyTaskId,
        ],
      );
      await upgrade.pool.query(
        "insert into work_item(id,project_id,source_capture_id,title,description) values($1,$2,$3,$4,$5)",
        [
          legacyTaskId,
          projectId,
          legacyTaskCaptureId,
          "Retained local task",
          "Retained selected body",
        ],
      );
      await upgrade.pool.query(
        "insert into capture_triage_suggestion(id,capture_id,kind,proposed_project_id,title,confidence,rationale,rule_version,source_label) values($1,$2,'task',$3,$4,80,'Retained local rationale','capture-triage/v1','Local deterministic rule')",
        [
          legacySuggestionId,
          legacyTaskCaptureId,
          projectId,
          "Retained local task",
        ],
      );
      await upgrade.pool.query(
        "insert into capture_triage_decision(id,capture_id,suggestion_id,decision,selected_project_id,selected_kind,selected_title,selected_body,filed_record_id,actor) values($1,$2,$3,'approve',$4,'task',$5,$6,$7,'local-user:unattributed')",
        [
          legacyDecisionId,
          legacyTaskCaptureId,
          legacySuggestionId,
          projectId,
          "Retained local task",
          "Retained selected body",
          legacyTaskId,
        ],
      );
      const legacySnapshots = await upgrade.pool.query(
        "select jsonb_build_object('capture',(select to_jsonb(r) from capture r where id=$1),'work',(select to_jsonb(r) from work_item r where id=$2),'suggestion',(select to_jsonb(r) from capture_triage_suggestion r where id=$3),'decision',(select to_jsonb(r) from capture_triage_decision r where id=$4)) as records",
        [
          legacyTaskCaptureId,
          legacyTaskId,
          legacySuggestionId,
          legacyDecisionId,
        ],
      );
      await assert.rejects(
        priorOwner.createClient(
          {
            name: "Proposal unavailable before 0062",
            projectId,
            environment: "test",
            operations: ["work.propose"],
            ttlSeconds: 3600,
          },
          "before-proposal-migration",
        ),
      );
      const proposalPrefix = {
        ...journal,
        entries: journal.entries.filter((entry) => entry.idx <= 62),
      };
      await writeFile(
        join(fixtureDir, "meta/_journal.json"),
        JSON.stringify(proposalPrefix),
      );
      for (const entry of proposalPrefix.entries.filter(
        (entry) => entry.idx > 61,
      ))
        await copyFile(
          join(migrations, `${entry.tag}.sql`),
          join(fixtureDir, `${entry.tag}.sql`),
        );
      await migrateDatabase({
        connectionString: upgradeUrl.toString(),
        migrationsDir: fixtureDir,
      });
      const oldEight = await priorOwner.createClient(
        {
          name: "Retained exact eight grants",
          projectId,
          environment: "test",
          operations: [
            "foundation.read",
            "work.read",
            "work.propose",
            "evidence.record",
            "memory.propose",
            "memory.revise",
            "configuration.record",
            "evaluation.record",
          ],
          ttlSeconds: 3600,
        },
        "before-resource-migration",
      );
      const beforeResourceGrants = await upgrade.pool.query(
        "select to_jsonb(r) as record from foundation_client r order by id",
      );
      await assert.rejects(
        priorOwner.createClient(
          {
            name: "Resource unavailable before 0063",
            projectId,
            environment: "test",
            operations: ["resources.read"],
            ttlSeconds: 3600,
          },
          "before-resource-denied",
        ),
      );
      await migrateDatabase({ connectionString: upgradeUrl.toString() });
      await migrateDatabase({ connectionString: upgradeUrl.toString() });
      assert.deepEqual(
        (
          await upgrade.pool.query(
            "select to_jsonb(r) as record from foundation_client r order by id",
          )
        ).rows,
        beforeResourceGrants.rows,
      );
      const resourceMigration = await readFile(
        join(migrations, "0063_foundation_resource_read.sql"),
        "utf8",
      );
      // Execute the actual two statements twice, independently of the journal.
      await upgrade.pool.query(resourceMigration);
      await upgrade.pool.query(resourceMigration);

      const retainedLocal = await upgrade.pool.query(
        "select jsonb_build_object('capture',(select to_jsonb(r) from capture r where id=$1),'work',(select to_jsonb(r) from work_item r where id=$2),'suggestion',(select to_jsonb(r)-'body'-'proposal' from capture_triage_suggestion r where id=$3),'decision',(select to_jsonb(r)-'provenance'-'creation_transaction' from capture_triage_decision r where id=$4)) as records",
        [
          legacyTaskCaptureId,
          legacyTaskId,
          legacySuggestionId,
          legacyDecisionId,
        ],
      );
      assert.deepEqual(retainedLocal.rows, legacySnapshots.rows);
      const migratedDecision = await upgrade.pool.query(
        "select provenance,creation_transaction from capture_triage_decision where id=$1",
        [legacyDecisionId],
      );
      assert.equal(migratedDecision.rows[0]!.provenance, null);
      assert.match(migratedDecision.rows[0]!.creation_transaction, /^\d+$/);
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
      const proposalClient = await owner.createClient(
        {
          name: "Explicit post-upgrade proposal grant",
          projectId,
          environment: "test",
          operations: ["work.propose"],
          ttlSeconds: 3600,
        },
        "upgrade-proposal-issue",
      );
      const proposals = createFoundationTaskProposalService(
        createFoundationTaskProposalAccessRepository(runtime.db),
        { environment: "test" },
      );
      const proposed = await proposals.submitTaskProposal(
        proposalClient.token,
        "upgrade-proposal-submit",
        {
          projectId,
          originalContent: "\ufeffExact post-upgrade proposal\r\n",
          proposedTitle: "Review after populated upgrade",
          proposedBody: "Unverified proposal body",
          rationale: "Actual populated upgrade acceptance",
        },
      );
      const reviewed = await proposals.reviewTaskProposal(
        {
          principalId: "user:upgrade-owner",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        "upgrade-proposal-review",
        {
          projectId,
          proposalId: proposed.record.proposalId,
          expectedVersion: 1,
          expectedProposalDigest: proposed.record.proposalDigest,
          expectedSourceDigest: proposed.record.sourceDigest,
          decision: "approve",
          selectedTitle: "Owner selected after upgrade",
          selectedBody: "Canonical selected body",
        },
      );
      assert.equal(
        reviewed.record.work!.sourceCaptureId,
        proposed.record.captureId,
      );
      assert.equal(reviewed.record.work!.title, "Owner selected after upgrade");
      assert.equal(
        (
          await proposals.getTaskProposal(
            {
              principalId: "user:upgrade-owner",
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
            { projectId, captureId: proposed.record.captureId },
          )
        ).capture.originalContent,
        "\ufeffExact post-upgrade proposal\r\n",
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
      const resourceClient = await owner.createClient(
        {
          name: "Explicit post0063 resource reader",
          projectId,
          environment: "test",
          operations: ["resources.read"],
          ttlSeconds: 3600,
        },
        "post-resource-issue",
      );
      const resourceReader = createFoundationResourceService(
        createFoundationResourceReadAccessRepository(runtime.db),
        { environment: "test" },
      );
      assert.deepEqual(
        (
          await resourceReader.listProjectResources(resourceClient.token, {
            projectId,
          })
        ).items,
        [],
      );
      await assert.rejects(
        resourceReader.listProjectResources(oldEight.token, { projectId }),
      );
      const [unchangedEight] = await upgrade.pool
        .query("select operations from foundation_client where id=$1", [
          oldEight.client.id,
        ])
        .then((x) => x.rows);
      assert.deepEqual(unchangedEight.operations, oldEight.client.operations);
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
