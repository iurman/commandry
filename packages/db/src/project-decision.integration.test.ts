import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createProjectDecisionService } from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createProjectDecisionRepository } from "./project-decision-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "project decisions retain immutable revisions, reject stale edits, and page every record",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const catalog = createCatalogRepository(database.db);
      const decisions = createProjectDecisionService(
        createProjectDecisionRepository(database.db),
      );
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Decision project",
      });
      const other = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Other decision project",
      });
      const first = await decisions.create(project.id, {
        question: "Which local route?",
        outcome: "Start with a manual review",
        alternatives: "Automatic filing",
        rationale: "Keep the source visible",
        status: "proposed",
      });
      assert.equal(first.revision, 1);
      assert.equal(first.sourceLabel, "Manual local decision");
      const updated = await decisions.revise(first.id, {
        question: first.question,
        outcome: "Require a manual review",
        alternatives: first.alternatives,
        rationale: "Preserve the original capture and show provenance",
        status: "accepted",
        expectedRevision: 1,
      });
      assert.equal(updated.revision, 2);
      await assert.rejects(
        decisions.revise(first.id, {
          question: first.question,
          outcome: "Stale overwrite",
          alternatives: "",
          rationale: "No",
          status: "accepted",
          expectedRevision: 1,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "DECISION_STALE",
      );
      const history = await decisions.listRevisions(first.id, { limit: 1 });
      assert.equal(history.items[0]?.outcome, "Require a manual review");
      assert.ok(history.nextCursor);
      const older = await decisions.listRevisions(first.id, {
        limit: 1,
        cursor: history.nextCursor,
      });
      assert.equal(older.items[0]?.outcome, "Start with a manual review");
      await assert.rejects(
        database.pool.query(
          "update project_decision_revision set outcome = $1 where id = $2",
          ["Tampered", older.items[0]!.id],
        ),
        /immutable/,
      );
      const second = await decisions.create(project.id, {
        question: "Which board?",
        outcome: "Open and done columns",
        alternatives: "Separate task copies",
        rationale: "One task set is easier to audit",
        status: "accepted",
      });
      await decisions.create(other.id, {
        question: "Other question",
        outcome: "Other outcome",
        alternatives: "",
        rationale: "Other context",
        status: "accepted",
      });
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await decisions.list(project.id, {
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(new Set(seen), new Set([first.id, second.id]));
      const snapshot = await createBriefRepository(
        database.db,
      ).readProjectSnapshot(project.id, { limit: 5 });
      assert.equal(snapshot?.decisions.items.length, 2);
      assert.equal(
        snapshot?.decisions.items.find((item) => item.id === first.id)
          ?.revision,
        2,
      );
      const search = await createCaptureRepository(database.db).search({
        q: "manual review",
        projectId: project.id,
        limit: 10,
      });
      assert.equal(search.items[0]?.kind, "decision");
      assert.equal(search.items[0]?.id, first.id);
      const final = await decisions.revise(first.id, {
        question: first.question,
        outcome: updated.outcome,
        alternatives: updated.alternatives,
        rationale: updated.rationale,
        status: "superseded",
        expectedRevision: 2,
      });
      assert.equal(final.status, "superseded");
      await assert.rejects(
        decisions.revise(first.id, { ...final, expectedRevision: 3 }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "DECISION_FINAL",
      );
    } finally {
      await database.close();
    }
  },
);
