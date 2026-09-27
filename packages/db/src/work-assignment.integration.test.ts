import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createExecutionPacketService,
  createProjectBriefService,
} from "@commandry/application";
import { WorkAssignmentError } from "@commandry/domain";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createLocalAgentRepository } from "./local-agent-repository";
import { localAgentRun, workItem } from "./schema";
import { createWorkAssignmentRepository } from "./work-assignment-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "Work assignment is project scoped, audited, and snapshotted without granting a run",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 4 });
    try {
      const catalog = createCatalogRepository(database.db);
      const captures = createCaptureRepository(database.db);
      const agents = createLocalAgentRepository(database.db);
      const assignments = createWorkAssignmentRepository(database.db);
      const briefs = createProjectBriefService(
        createBriefRepository(database.db),
      );
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const primary = await catalog.createProject({
        id: crypto.randomUUID(),
        name: `Assignment primary ${crypto.randomUUID()}`,
      });
      const other = await catalog.createProject({
        id: crypto.randomUUID(),
        name: `Assignment other ${crypto.randomUUID()}`,
      });
      const original = "  Assign the local source-backed inspection  ";
      const capture = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: original,
      });
      const filed = await captures.fileAsTask({
        captureId: capture.id,
        recordId: crypto.randomUUID(),
        projectId: primary.id,
        title: "Inspect assigned work",
        description: "Use the original source",
      });
      assert.ok("status" in filed.record);
      const task = filed.record;
      const eligible = await agents.create({ name: "Assigned reviewer" });
      const secondEligible = await agents.create({ name: "Other reviewer" });
      const outOfScope = await agents.create({ name: "Out of scope reviewer" });
      await agents.assignProject(eligible.id, primary.id);
      await agents.assignProject(secondEligible.id, primary.id);
      await agents.assignProject(outOfScope.id, other.id);

      const eligibleFirst = await assignments.listEligibleAgents(primary.id, {
        limit: 1,
      });
      assert.ok(eligibleFirst.nextCursor);
      const eligibleSecond = await assignments.listEligibleAgents(primary.id, {
        limit: 1,
        cursor: eligibleFirst.nextCursor,
      });
      assert.deepEqual(
        new Set(
          [...eligibleFirst.items, ...eligibleSecond.items].map((a) => a.id),
        ),
        new Set([eligible.id, secondEligible.id]),
      );
      await assert.rejects(
        assignments.changeAssignment(task.id, {
          expectedUpdatedAt: task.updatedAt,
          assigneeKind: "agent",
          agentId: outOfScope.id,
        }),
        (error: unknown) =>
          error instanceof WorkAssignmentError &&
          error.code === "AGENT_NOT_IN_PROJECT",
      );

      const toHuman = await assignments.changeAssignment(task.id, {
        expectedUpdatedAt: task.updatedAt,
        assigneeKind: "local_user",
        agentId: null,
      });
      assert.equal(toHuman.assigneeLabel, "Local user (unattributed)");
      await assert.rejects(
        assignments.changeAssignment(task.id, {
          expectedUpdatedAt: task.updatedAt,
          assigneeKind: "agent",
          agentId: eligible.id,
        }),
        (error: unknown) =>
          error instanceof WorkAssignmentError &&
          error.code === "ASSIGNMENT_CONFLICT",
      );
      const toAgent = await assignments.changeAssignment(task.id, {
        expectedUpdatedAt: toHuman.updatedAt,
        assigneeKind: "agent",
        agentId: eligible.id,
      });
      assert.equal(toAgent.assigneeAgentId, eligible.id);
      assert.equal(
        toAgent.assigneeLabel,
        "Synthetic local agent: Assigned reviewer",
      );
      const events = await assignments.listAssignmentEvents(task.id, {
        limit: 1,
      });
      assert.equal(events.items[0]?.nextAgentId, eligible.id);
      assert.ok(events.nextCursor);
      assert.equal(
        (
          await assignments.listAssignmentEvents(task.id, {
            limit: 1,
            cursor: events.nextCursor,
          })
        ).items[0]?.nextKind,
        "local_user",
      );
      const exact = await assignments.getAssignmentEventById(
        events.items[0]!.id,
      );
      assert.equal(exact?.nextLabel, toAgent.assigneeLabel);

      const brief = await briefs.getBrief(primary.id);
      const briefItem = brief?.sections.work.items.find(
        (item) => item.id === task.id,
      );
      assert.ok(briefItem?.detail.includes(toAgent.assigneeLabel!));
      assert.ok(
        briefItem?.evidence.some(
          (reference) =>
            reference.kind === "work_item_assignment_event" &&
            reference.id === exact?.id &&
            reference.href ===
              `/api/v1/work-item-assignment-events/${exact.id}`,
        ),
      );
      const packet = await packets.create(task.id, {
        selectedKnowledgeIds: [],
        selectedResourceIds: [],
      });
      assert.equal(
        packet.snapshot.objective.assignee?.label,
        toAgent.assigneeLabel,
      );
      assert.equal(packet.snapshot.objective.assignee?.evidence.id, exact?.id);
      assert.equal(
        packet.snapshot.objective.assignee?.evidence.isSynthetic,
        false,
      );

      const cleared = await assignments.changeAssignment(task.id, {
        expectedUpdatedAt: toAgent.updatedAt,
        assigneeKind: "unassigned",
        agentId: null,
      });
      assert.equal(cleared.assigneeLabel, null);
      assert.equal(
        (await packets.getById(packet.id))?.snapshot.objective.assignee?.label,
        toAgent.assigneeLabel,
      );
      assert.equal(
        (await briefs.getBrief(primary.id))?.sections.work.items
          .find((item) => item.id === task.id)
          ?.detail.includes("Assigned to"),
        false,
      );
      assert.equal(
        (
          await database.db
            .select()
            .from(localAgentRun)
            .where(eq(localAgentRun.workItemId, task.id))
        ).length,
        0,
      );
      assert.equal(
        (await captures.getCapture(capture.id))?.originalContent,
        original,
      );

      await assert.rejects(
        database.pool.query(
          "update work_item set assignee_kind = 'local_user', assignee_label = 'Local user (unattributed)' where id = $1",
          [task.id],
        ),
        /exact audit event/,
      );
      await assert.rejects(
        database.pool.query(
          "update work_item_assignment_event set next_label = 'rewritten' where id = $1",
          [exact!.id],
        ),
        /immutable/,
      );
      const [stored] = await database.db
        .select()
        .from(workItem)
        .where(eq(workItem.id, task.id));
      assert.equal(stored?.assigneeKind, "unassigned");
      assert.equal(stored?.projectId, primary.id);
    } finally {
      await database.close();
    }
  },
);
