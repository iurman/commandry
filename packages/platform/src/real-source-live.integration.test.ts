import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  createCatalogRepository,
  createDatabase,
  createRealIntegrationRepository,
} from "@commandry/db";
import { linuxHostSampleSchema } from "@commandry/contracts";
import { createRealIntegrationPoller } from "@commandry/application";
import { createGitHubActivityReader } from "./github-activity";
const samplePath = process.env.COMMANDRY_LIVE_HOST_SAMPLE_PATH;
test(
  "actual GitHub activity and an unprivileged electra sample persist as real evidence",
  { skip: !samplePath, timeout: 30_000 },
  async () => {
    const url = new URL(process.env.COMMANDRY_TEST_DATABASE_URL!);
    url.username = "commandry_app_integration";
    url.password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD!;
    const database = createDatabase({
      connectionString: url.toString(),
      max: 3,
    });
    try {
      const sample = linuxHostSampleSchema.parse(
        JSON.parse(await readFile(samplePath!, "utf8")),
      );
      assert.equal(sample.hostname, "electra");
      const catalog = createCatalogRepository(database.db);
      const sources = createRealIntegrationRepository(database.db);
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Disposable actual source smoke",
      });
      const resources = await Promise.all([
        catalog.createResource({
          id: crypto.randomUUID(),
          kind: "repository",
          name: "iurman/commandry",
        }),
        catalog.createResource({
          id: crypto.randomUUID(),
          kind: "host",
          name: "electra",
        }),
      ]);
      for (const resource of resources)
        await catalog.insertProjectResourceLink({
          id: crypto.randomUUID(),
          projectId: project.id,
          resourceId: resource.id,
          type: "supports",
          sourceKind: "resource",
          targetKind: "project",
        });
      const github = (await sources.create(
        {
          name: "Actual public GitHub",
          kind: "github-repository",
          identifier: "iurman/commandry",
          projectId: project.id,
          resourceId: resources[0]!.id,
          freshnessWindowMinutes: 15,
        },
        "operator:live-smoke",
      ))!;
      const host = (await sources.create(
        {
          name: "Actual electra sample",
          kind: "linux-host",
          identifier: "electra",
          projectId: project.id,
          resourceId: resources[1]!.id,
          freshnessWindowMinutes: 15,
        },
        "operator:live-smoke",
      ))!;
      const issued = await sources.rotateToken(host.id, "operator:live-smoke");
      await sources.receive(host.id, issued.token, sample);
      const poller = createRealIntegrationPoller(
        sources,
        createGitHubActivityReader(),
      );
      assert.equal(await poller.pollNext(), true);
      const status = await sources.get(github.id);
      assert.equal(status?.lastError, null);
      assert.ok(status?.lastSuccessAt);
      const activity = await sources.observations(github.id, { limit: 100 });
      assert.ok(
        activity.items.length > 0,
        "Actual repository activity is required to prove provider ingestion",
      );
      assert.ok(activity.items.every((item) => item.isSynthetic === false));
      const evidence = await sources.getEnvelope(
        activity.items[0]!.sourceEnvelopeId,
      );
      assert.equal(evidence?.sourceKind, "github-repository");
      const telemetry = await sources.observations(host.id, { limit: 1 });
      assert.equal(telemetry.items[0]?.metrics.length, 4);
      console.log(
        JSON.stringify({
          repository: github.identifier,
          githubEventsOnFirstPage: activity.items.length,
          githubFreshness: status?.freshnessState,
          host: sample.hostname,
          sampledAt: sample.observedAt,
          telemetryMetricCount: telemetry.items[0]?.metrics.length,
          projectId: project.id,
          productionActivated: false,
        }),
      );
    } finally {
      await database.close();
    }
  },
);
