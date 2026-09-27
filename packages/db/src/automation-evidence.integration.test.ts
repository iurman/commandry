import assert from "node:assert/strict";
import { test } from "node:test";
import { createAutomationReviewService } from "@commandry/application";
import { automationRunResultSchema } from "@commandry/contracts";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createAutomationEvidenceRepository } from "./automation-evidence-repository";
import { createLocalAutomationRepository } from "./local-automation-repository";
import { automationDefinition, automationRun } from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("automation evidence checks and paged export preserve exact synthetic run records", async () => {
  const database = createDatabase({ connectionString, max: 3 });
  try {
    const project = await createCatalogRepository(database.db).createProject({
      id: crypto.randomUUID(),
      name: `Automation evidence ${crypto.randomUUID()}`,
    });
    const definitionId = crypto.randomUUID();
    await database.db.insert(automationDefinition).values({
      id: definitionId,
      projectId: project.id,
      name: "Local evidence summary",
    });
    const makeResult = (kind: "project" | "resource", id: string) =>
      automationRunResultSchema.parse({
        summary: "Synthetic local brief preview; no external action",
        asOf: new Date().toISOString(),
        evidence: [
          {
            kind,
            id,
            href: `/api/v1/${kind === "project" ? "projects" : "resources"}/${id}`,
            recordedAt: new Date().toISOString(),
            occurredAt: null,
            sourceLabel: "Local fixture",
            isSynthetic: false,
          },
        ],
        sourceLabel: "Synthetic local automation",
        isSynthetic: true,
        verificationStatus: "unverified",
        externalActions: [],
      });
    const presentRunId = crypto.randomUUID();
    const missingRunId = crypto.randomUUID();
    await database.db.insert(automationRun).values([
      {
        id: presentRunId,
        definitionId,
        projectId: project.id,
        occurrenceId: crypto.randomUUID(),
        trigger: "manual",
        state: "succeeded",
        result: makeResult("project", project.id),
        completedAt: new Date(),
      },
      {
        id: missingRunId,
        definitionId,
        projectId: project.id,
        occurrenceId: crypto.randomUUID(),
        trigger: "manual",
        state: "succeeded",
        result: makeResult("resource", crypto.randomUUID()),
        completedAt: new Date(),
      },
    ]);
    const automation = createLocalAutomationRepository(database.db);
    const service = createAutomationReviewService({
      getRun: automation.getRun,
      getDefinition: automation.getDefinition,
      listRuns: automation.listRuns,
      ...createAutomationEvidenceRepository(database.db),
    });
    const complete = await service.checkEvidence(presentRunId);
    assert.equal(complete.status, "complete");
    assert.equal(complete.evidenceCount, 1);
    assert.equal(complete.scope, "reference_presence_only");
    const missing = await service.checkEvidence(missingRunId);
    assert.equal(missing.status, "missing");
    assert.equal(missing.missing.length, 1);
    assert.equal(
      (await service.listChecks(presentRunId, { limit: 10 })).items[0]?.id,
      complete.id,
    );
    const repeated = await service.checkEvidence(presentRunId);
    const checkPage = await service.listChecks(presentRunId, { limit: 1 });
    assert.equal(checkPage.items.length, 1);
    assert.ok(checkPage.nextCursor);
    const olderChecks = await service.listChecks(presentRunId, {
      limit: 1,
      cursor: checkPage.nextCursor,
    });
    assert.deepEqual(
      new Set(
        [...checkPage.items, ...olderChecks.items].map((check) => check.id),
      ),
      new Set([complete.id, repeated.id]),
    );
    assert.equal(olderChecks.nextCursor, null);
    const first = await service.exportPage(definitionId, { limit: 1 });
    assert.equal(first.sourceOfTruth, "local-only");
    assert.equal(first.runs.length, 1);
    assert.ok(first.nextCursor);
    const second = await service.exportPage(definitionId, {
      limit: 1,
      cursor: first.nextCursor,
    });
    assert.deepEqual(
      new Set([...first.runs, ...second.runs].map((run) => run.id)),
      new Set([presentRunId, missingRunId]),
    );
    assert.equal(second.nextCursor, null);
    assert.equal(
      (await automation.getRun(presentRunId))?.result?.verificationStatus,
      "unverified",
    );
    const audit = await automation.listAudit(definitionId, { limit: 10 });
    assert.equal(
      audit.items.filter(
        (entry) => entry.operation === "automation.evidence_checked",
      ).length,
      3,
    );
  } finally {
    await database.close();
  }
});
