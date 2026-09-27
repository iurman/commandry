import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createLocalIntegrationRepository } from "./integration-repository";
import { createLocalConnectorRepository } from "./local-connector-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("local receiver token and poll feed persist with idempotent occurrence claims", async () => {
  const database = createDatabase({ connectionString, max: 3 });
  try {
    const project = await createCatalogRepository(database.db).createProject({
      id: crypto.randomUUID(),
      name: `Synthetic connector ${crypto.randomUUID()}`,
    });
    const integration = await createLocalIntegrationRepository(
      database.db,
    ).create({
      name: "Synthetic development receiver",
      kind: "synthetic-development",
      projectId: project.id,
      resourceId: null,
    });
    const connector = createLocalConnectorRepository(database.db);
    const firstToken = await connector.rotateToken(integration.id);
    assert.equal(
      await connector.verifyToken(integration.id, firstToken.token),
      true,
    );
    assert.equal(
      await connector.verifyToken(integration.id, "bad-token"),
      false,
    );
    const secondToken = await connector.rotateToken(integration.id);
    assert.equal(
      await connector.verifyToken(integration.id, firstToken.token),
      false,
    );
    assert.equal(
      await connector.verifyToken(integration.id, secondToken.token),
      true,
    );

    const input = {
      scenarioId: "development.pr-merged" as const,
      occurrenceId: `connector:${crypto.randomUUID()}`,
    };
    const queued = await connector.enqueue(integration.id, input);
    assert.equal(
      (await connector.enqueue(integration.id, input)).id,
      queued.id,
    );
    const claimed = await connector.claimNext();
    assert.equal(claimed?.id, queued.id);
    assert.equal(claimed?.attempts, 1);
    const importId = crypto.randomUUID();
    await connector.complete(queued.id, importId);
    const page = await connector.list(integration.id, { limit: 10 });
    assert.equal(page.items[0]?.state, "submitted");
    assert.equal(page.items[0]?.importId, importId);
    assert.equal(page.items[0]?.isSynthetic, true);
    await assert.rejects(
      connector.enqueue(integration.id, {
        ...input,
        scenarioId: "operations.monitor-down",
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "SCENARIO_MISMATCH",
    );
  } finally {
    await database.close();
  }
});
