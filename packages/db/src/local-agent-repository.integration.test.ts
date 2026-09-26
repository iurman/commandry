import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { LocalAgentError } from "@commandry/domain";
import { createDatabase } from "./client";
import { createLocalAgentRepository } from "./local-agent-repository";
import { createLocalAgentRunRepository } from "./local-agent-run-repository";
import { auditEvent, capture, project, workItem } from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "local agent registry and assignments page fully while work reads stay project scoped",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 3 });
    const profiles = createLocalAgentRepository(database.db);
    const runs = createLocalAgentRunRepository(database.db);
    const projectIds = Array.from({ length: 7 }, () => crypto.randomUUID());
    const profileIds: string[] = [];
    try {
      await database.db.insert(project).values(
        projectIds.map((id, index) => ({
          id,
          name: `Local agent project ${index} ${crypto.randomUUID()}`,
        })),
      );
      for (let index = 0; index < 7; index += 1) {
        const profile = await profiles.create({
          name: `Local fake profile ${index}`,
          ...(index === 0 ? { role: "Review local context" } : {}),
        });
        profileIds.push(profile.id);
        assert.equal(profile.runtime, "local-fake-v1");
        assert.equal(profile.sourceLabel, "Synthetic local agent");
        assert.equal(profile.isSynthetic, true);
        assert.equal(profile.role, index === 0 ? "Review local context" : null);
        assert.deepEqual(await profiles.getById(profile.id), profile);
      }
      assert.equal(await profiles.getById(crypto.randomUUID()), null);
      const profileAudits = await database.db
        .select()
        .from(auditEvent)
        .where(eq(auditEvent.operation, "local_agent_profile.created"));
      assert.equal(
        profileAudits.filter((event) =>
          profileIds.includes(String(event.details.agentId)),
        ).length,
        7,
      );
      assert.ok(
        profileAudits
          .filter((event) => profileIds.includes(String(event.details.agentId)))
          .every((event) => event.actor === "system:local-preview"),
      );

      const listedIds = new Set<string>();
      let cursor: string | undefined;
      for (let page = 0; page < 100; page += 1) {
        const result = await profiles.list({ limit: 2, cursor });
        for (const item of result.items) {
          assert.equal(listedIds.has(item.id), false);
          listedIds.add(item.id);
        }
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      assert.ok(profileIds.every((id) => listedIds.has(id)));

      const agentId = profileIds[0]!;
      const assignedIds: string[] = [];
      for (const projectId of projectIds) {
        assert.equal(await profiles.projectExists(projectId), true);
        const assignment = await profiles.assignProject(agentId, projectId);
        assignedIds.push(assignment.id);
        assert.equal(assignment.projectId, projectId);
        assert.equal(assignment.isSynthetic, true);
        assert.equal(await profiles.isAssigned(agentId, projectId), true);
      }
      assert.equal(await profiles.projectExists(crypto.randomUUID()), false);
      assert.equal(
        await profiles.isAssigned(profileIds[1]!, projectIds[0]!),
        false,
      );
      await assert.rejects(
        profiles.assignProject(agentId, projectIds[0]!),
        (error: unknown) =>
          error instanceof LocalAgentError &&
          error.code === "ASSIGNMENT_EXISTS",
      );
      const assignmentAudits = await database.db
        .select()
        .from(auditEvent)
        .where(
          eq(auditEvent.operation, "local_agent_project_assignment.created"),
        );
      assert.equal(
        assignmentAudits.filter((event) => event.details.agentId === agentId)
          .length,
        7,
      );
      const seenAssignments = new Set<string>();
      cursor = undefined;
      do {
        const page = await profiles.listProjects(agentId, { limit: 3, cursor });
        for (const item of page.items) {
          assert.equal(item.agentId, agentId);
          assert.equal(seenAssignments.has(item.id), false);
          seenAssignments.add(item.id);
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.deepEqual(seenAssignments, new Set(assignedIds));

      const workId = crypto.randomUUID();
      const captureId = crypto.randomUUID();
      await database.db.insert(capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "Scoped original work source",
        source: "manual-local",
        author: "local-user",
        state: "filed",
        projectId: projectIds[0]!,
        filedRecordKind: "task",
        filedRecordId: workId,
        filedAt: new Date(),
      });
      await database.db.insert(workItem).values({
        id: workId,
        projectId: projectIds[0]!,
        sourceCaptureId: captureId,
        title: "Scoped work item",
        description: "A project-only work detail",
      });
      assert.equal(
        (await runs.getWorkItem(workId, projectIds[0]!))?.sourceCaptureId,
        captureId,
      );
      assert.equal(await runs.getWorkItem(workId, projectIds[1]!), null);
    } finally {
      await database.close();
    }
  },
);
