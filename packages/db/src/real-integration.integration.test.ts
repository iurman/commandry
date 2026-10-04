import assert from "node:assert/strict";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { normalizeGitHubActivity } from "@commandry/domain";
import { createDatabase } from "./client";
import { createCatalogRepository } from "./catalog-repository";
import { createRealIntegrationRepository } from "./real-integration-repository";
import { createLocalIntegrationRepository } from "./integration-repository";
import { createSyntheticEventImportRepository } from "./synthetic-event-repository";
import {
  integrationInstance,
  realIntegrationState,
  projectResourceLink,
  sourceEnvelope,
  normalizedEvent,
  metricSample,
} from "./schema";
const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!adminUrl) throw new Error("Run through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD!;
test("real sources preserve shared evidence, scope, replay, freshness and fenced polling with the application role", async () => {
  const database = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 4,
  });
  const repo = createRealIntegrationRepository(database.db);
  const catalog = createCatalogRepository(database.db);
  try {
    const project = await catalog.createProject({
      id: crypto.randomUUID(),
      name: "Real source integration test",
    });
    const host = await catalog.createResource({
      id: crypto.randomUUID(),
      kind: "host",
      name: "Test host",
    });
    const repository = await catalog.createResource({
      id: crypto.randomUUID(),
      kind: "repository",
      name: "Test repository",
    });
    const hostLinkId = crypto.randomUUID();
    await catalog.insertProjectResourceLink({
      id: hostLinkId,
      projectId: project.id,
      resourceId: host.id,
      type: "supports",
      sourceKind: "resource",
      targetKind: "project",
    });
    await catalog.insertProjectResourceLink({
      id: crypto.randomUUID(),
      projectId: project.id,
      resourceId: repository.id,
      type: "supports",
      sourceKind: "resource",
      targetKind: "project",
    });
    await assert.rejects(
      repo.create(
        {
          name: "Wrong kind",
          kind: "github-repository",
          identifier: "test/repo",
          projectId: project.id,
          resourceId: host.id,
          freshnessWindowMinutes: 15,
        },
        "user:test",
      ),
      /requires an active/,
    );
    const hostSource = (await repo.create(
      {
        name: "Host",
        kind: "linux-host",
        identifier: "electra",
        projectId: project.id,
        resourceId: host.id,
        freshnessWindowMinutes: 15,
      },
      "user:test",
    ))!;
    const gitSource = (await repo.create(
      {
        name: "Git",
        kind: "github-repository",
        identifier: "test/repo",
        projectId: project.id,
        resourceId: repository.id,
        freshnessWindowMinutes: 15,
      },
      "user:test",
    ))!;
    const token = await repo.rotateToken(hostSource.id, "user:test");
    const sample = {
      hostname: "electra",
      sampleId: crypto.randomUUID(),
      observedAt: new Date().toISOString(),
      memory: { totalBytes: 1000, availableBytes: 500 },
      disk: { totalBytes: 1000, availableBytes: 750 },
      uptimeSeconds: 10,
      load1Milli: 100,
    };
    await assert.rejects(
      repo.receive(hostSource.id, "wrong", sample),
      /token is invalid/,
    );
    await repo.receive(hostSource.id, token.token, sample);
    await repo.receive(hostSource.id, token.token, sample);
    let page = await repo.observations(hostSource.id, { limit: 1 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.metrics.length, 4);
    assert.equal(page.items[0]?.isSynthetic, false);
    const envelopeId = page.items[0]!.sourceEnvelopeId;
    assert.deepEqual((await repo.getEnvelope(envelopeId))?.rawPayload, sample);
    await assert.rejects(
      repo.receive(hostSource.id, token.token, {
        ...sample,
        uptimeSeconds: 11,
      }),
      /different evidence/,
    );
    const rotated = await repo.rotateToken(hostSource.id, "user:test");
    await assert.rejects(
      repo.receive(hostSource.id, token.token, sample),
      /token is invalid/,
    );
    await repo.receive(hostSource.id, rotated.token, {
      ...sample,
      sampleId: crypto.randomUUID(),
      observedAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    assert.equal((await repo.get(hostSource.id))?.freshnessState, "fresh");
    page = await repo.observations(hostSource.id, { limit: 1 });
    assert.ok(page.nextCursor);
    const second = await repo.observations(hostSource.id, {
      limit: 1,
      cursor: page.nextCursor!,
    });
    assert.equal(second.items.length, 1);
    assert.notEqual(second.items[0]?.id, page.items[0]?.id);
    assert.equal(
      (
        await createLocalIntegrationRepository(database.db).list({ limit: 100 })
      ).items.some((item) => item.id === hostSource.id),
      false,
    );
    const event = await createSyntheticEventImportRepository(
      database.db,
    ).getEventById(page.items[0]!.id);
    assert.equal(event?.isSynthetic, false);
    assert.equal(event?.sourceLabel, "Linux host telemetry");
    await repo.setEnabled(hostSource.id, false, "user:test");
    await assert.rejects(
      repo.receive(hostSource.id, rotated.token, sample),
      /disabled/,
    );
    await repo.setEnabled(hostSource.id, true, "user:test");
    await database.db
      .update(projectResourceLink)
      .set({ lifecycle: "archived" })
      .where(eq(projectResourceLink.id, hostLinkId));
    await assert.rejects(
      repo.receive(hostSource.id, rotated.token, sample),
      /requires an active/,
    );
    const claims = await Promise.all([repo.claimDue(), repo.claimDue()]);
    assert.equal(claims.filter(Boolean).length, 1);
    const claim = claims.find(Boolean)!;
    assert.equal(claim.id, gitSource.id);
    const projection = normalizeGitHubActivity("test/repo", {
      id: "123",
      repo: { name: "test/repo" },
      type: "PushEvent",
      created_at: new Date().toISOString(),
      payload: { ref: "main" },
    });
    const providerPage = {
      events: [],
      notModified: false,
      etag: '"first"',
      hasNext: true,
      pollSeconds: 60,
    };
    await repo.completePoll(claim, [projection], providerPage);
    await database.db
      .update(realIntegrationState)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(realIntegrationState.integrationInstanceId, gitSource.id));
    const continued = (await repo.claimDue())!;
    assert.equal(continued.page, 2);
    assert.equal(continued.pendingEtag, '"first"');
    await repo.completePoll(claim, [projection], {
      ...providerPage,
      hasNext: false,
    });
    assert.equal(await repo.claimDue(), null);
    await repo.completePoll(continued, [projection], {
      ...providerPage,
      etag: '"second-page"',
      hasNext: false,
    });
    assert.equal(
      (await repo.observations(gitSource.id, { limit: 10 })).items.length,
      1,
    );
    const [state] = await database.db
      .select()
      .from(realIntegrationState)
      .where(eq(realIntegrationState.integrationInstanceId, gitSource.id));
    assert.equal(state?.etag, '"first"');
    assert.equal(state?.page, 1);
    assert.equal((await repo.list({ limit: 1 })).nextCursor !== null, true);
    await database.db
      .update(realIntegrationState)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(realIntegrationState.integrationInstanceId, gitSource.id));
    const disabledClaim = (await repo.claimDue())!;
    await repo.setEnabled(gitSource.id, false, "user:test");
    await repo.completePoll(
      disabledClaim,
      [{ ...projection, sourceEventId: "456" }],
      { ...providerPage, hasNext: false },
    );
    assert.equal(
      (await repo.observations(gitSource.id, { limit: 10 })).items.length,
      1,
    );
    assert.equal((await repo.get(gitSource.id))?.enabled, false);
    await repo.setEnabled(gitSource.id, true, "user:test");
    await database.db
      .update(realIntegrationState)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(realIntegrationState.integrationInstanceId, gitSource.id));
    await database.db
      .update(projectResourceLink)
      .set({ lifecycle: "archived" })
      .where(eq(projectResourceLink.resourceId, repository.id));
    assert.equal(await repo.claimDue(), null);
    // Prove storage itself refuses a real observation disguised as fixture evidence.
    await assert.rejects(
      database.db.insert(sourceEnvelope).values({
        id: crypto.randomUUID(),
        importId: null,
        integrationInstanceId: gitSource.id,
        sourceKind: "github-repository",
        sourceLabel: "GitHub repository activity",
        sourceSchemaVersion: "github-events/v1",
        sourceEventId: crypto.randomUUID(),
        rawPayload: {},
        occurredAt: new Date(),
        isSynthetic: true,
      }),
    );
    const counts = await database.db.execute(
      sql`select count(*) as count from ${metricSample} where ${metricSample.resourceId} = ${host.id}`,
    );
    assert.equal(Number(counts.rows[0]?.count), 8);
    const realRows = await database.db
      .select()
      .from(normalizedEvent)
      .where(eq(normalizedEvent.resourceId, repository.id));
    assert.equal(realRows.length, 1);
    assert.ok(
      await database.db
        .select()
        .from(integrationInstance)
        .where(eq(integrationInstance.id, hostSource.id)),
    );
  } finally {
    await database.close();
  }
});
