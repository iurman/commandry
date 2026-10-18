import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import {
  createDatabase,
  migrateDatabase,
  schema,
  createFoundationAccessRepository,
  createRealIntegrationRepository,
  createObservatoryOwnerReadRepository,
} from "../packages/db/src/index.ts";
import {
  createFoundationOwnerService,
  createObservatoryReadService,
} from "../packages/application/src/index.ts";
import { mixedObservatoryFixture } from "../tests/fixtures/observatory.ts";

// Isolated PostgreSQL 18 only. No deployed credentials, SQL or external requests.
const root = resolve(import.meta.dirname, "..");
const migrationsDir = join(root, "packages/db/migrations");
const journal = JSON.parse(
  await readFile(join(migrationsDir, "meta/_journal.json"), "utf8"),
);
assert.equal(
  journal.entries.at(-1).idx,
  74,
  "Review this audit when the migration sequence changes",
);
const directory = await mkdtemp(
  join(tmpdir(), "commandry-observatory-upgrade-"),
);
const listener = createServer();
await new Promise((done, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", done);
});
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const password = randomBytes(24).toString("hex"),
  runtimePassword = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({
  databaseDir: join(directory, "data"),
  port,
  user: "postgres",
  password,
  authMethod: "scram-sha-256",
  persistent: false,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const databaseName = "commandry_observatory_upgrade";
const adminUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/${databaseName}`;
const tables = [
  "project",
  "resource",
  "project_resource_link",
  "integration_instance",
  "real_integration_state",
  "source_envelope",
  "normalized_event",
  "metric_sample",
  "foundation_client",
  "user",
  "session",
];
let admin,
  runtime,
  started = false;
async function snapshot() {
  const rows = {};
  for (const name of tables)
    rows[name] = (
      await admin.pool.query(
        `select to_jsonb(t) as record from public."${name}" t order by to_jsonb(t)::text`,
      )
    ).rows.map((row) => row.record);
  return rows;
}
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase(databaseName);
  const oldDir = join(directory, "migrations-through-0067");
  await cp(migrationsDir, oldDir, { recursive: true });
  await writeFile(
    join(oldDir, "meta/_journal.json"),
    JSON.stringify({
      ...journal,
      entries: journal.entries.filter((entry) => entry.idx <= 67),
    }),
  );
  await migrateDatabase({ connectionString: adminUrl, migrationsDir: oldDir });
  admin = createDatabase({ connectionString: adminUrl, max: 2 });
  assert.match(
    (await admin.pool.query("show server_version")).rows[0].server_version,
    /^18\./,
  );
  assert.equal(
    Number(
      (
        await admin.pool.query(
          "select count(*) as n from drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
    ),
    68,
  );
  assert.equal(
    (
      await admin.pool.query(
        "select to_regclass('public.observatory_source') as name",
      )
    ).rows[0].name,
    null,
  );
  await admin.pool.query(
    `create role commandry_observatory_upgrade_runtime login password '${runtimePassword}'`,
  );
  await admin.pool.query(
    `grant connect on database ${databaseName} to commandry_observatory_upgrade_runtime`,
  );
  await admin.pool.query(
    "grant usage on schema public to commandry_observatory_upgrade_runtime",
  );
  await admin.pool.query(
    "grant select,insert,update,delete on all tables in schema public to commandry_observatory_upgrade_runtime",
  );
  await admin.pool.query(
    "alter default privileges in schema public grant select,insert,update,delete on tables to commandry_observatory_upgrade_runtime",
  );
  runtime = createDatabase({
    connectionString: `postgresql://commandry_observatory_upgrade_runtime:${runtimePassword}@127.0.0.1:${port}/${databaseName}`,
    max: 1,
  });
  const fixture = mixedObservatoryFixture();
  await admin.db.insert(schema.project).values(fixture.projects);
  await admin.db.insert(schema.resource).values(
    fixture.resources.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
    })),
  );
  for (const item of fixture.resources)
    if (item.parentResourceId)
      await admin.pool.query(
        "update resource set parent_resource_id=$1 where id=$2",
        [item.parentResourceId, item.id],
      );
  const links = fixture.resources.flatMap((item) =>
    item.projects.map((project) => ({
      id: randomUUID(),
      projectId: project.id,
      resourceId: item.id,
      type: "relates_to",
      sourceKind: "project",
      targetKind: "resource",
      lifecycle: "active",
    })),
  );
  const hosts = fixture.resources.filter((item) => item.sources.length);
  for (const [index, host] of hosts.entries())
    if (!links.some((link) => link.resourceId === host.id))
      links.push({
        id: randomUUID(),
        projectId: fixture.projects[index + 4].id,
        resourceId: host.id,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
        lifecycle: "active",
      });
  await admin.db.insert(schema.projectResourceLink).values(links);
  const sources = createRealIntegrationRepository(runtime.db);
  for (const [index, host] of hosts.entries()) {
    const source = await sources.create(
      {
        name: "Upgrade fixture observation",
        kind: "linux-host",
        projectId: links.find((link) => link.resourceId === host.id).projectId,
        resourceId: host.id,
        identifier: "upgrade-host-" + index,
        freshnessWindowMinutes: 10080,
      },
      "fixture:upgrade",
    );
    const token = await sources.rotateToken(source.id, "fixture:upgrade");
    await sources.receive(source.id, token.token, {
      hostname: "upgrade-host-" + index,
      sampleId: randomUUID(),
      observedAt: new Date().toISOString(),
      memory: { totalBytes: 17179869184, availableBytes: 8589934592 },
      disk: { totalBytes: 107374182400, availableBytes: 53687091200 },
      uptimeSeconds: 3600,
      load1Milli: 1500,
    });
  }
  const userId = randomUUID(),
    sessionId = randomUUID(),
    expiresAt = new Date(Date.now() + 3600000).toISOString();
  await admin.db.insert(schema.user).values({
    id: userId,
    name: "Disposable migration owner",
    email: userId + "@example.test",
  });
  await admin.db.insert(schema.session).values({
    id: sessionId,
    userId,
    token: randomUUID(),
    expiresAt: new Date(expiresAt),
  });
  const identity = { principalId: "user:" + userId, sessionId, expiresAt };
  const issuer = createFoundationOwnerService(
    createFoundationAccessRepository(runtime.db),
    identity,
    { environment: "test" },
  );
  await issuer.createClient(
    {
      name: "Pre-Observatory exact grants",
      projectId: fixture.projects[0].id,
      environment: "test",
      operations: ["resources.read", "work.read"],
      ttlSeconds: 3600,
    },
    randomUUID(),
  );
  const before = await snapshot();
  assert.equal(before.resource.length, 91);
  assert.equal(before.project.length, 15);
  assert.equal(before.real_integration_state.length, 4);
  assert.ok(before.metric_sample.length >= 16);
  for (let attempt = 0; attempt < 2; attempt++) {
    await migrateDatabase({ connectionString: adminUrl, migrationsDir });
    assert.deepEqual(
      await snapshot(),
      before,
      "Upgrade and repeat must preserve every prior canonical record and exact grant",
    );
    assert.equal(
      Number(
        (
          await admin.pool.query(
            "select count(*) as n from drizzle.__drizzle_migrations",
          )
        ).rows[0].n,
      ),
      journal.entries.length,
    );
    assert.equal(
      Number(
        (
          await runtime.pool.query(
            "select count(*) as n from observatory_resource_logo",
          )
        ).rows[0].n,
      ),
      0,
      "Upgrade must not invent approved repository logos",
    );
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"])
      assert.equal(
        (
          await runtime.pool.query(
            "select has_table_privilege(current_user, 'observatory_resource_logo', $1) as allowed",
            [privilege],
          )
        ).rows[0].allowed,
        true,
        `The upgraded runtime needs ${privilege} on reviewed logos`,
      );
  }
  await assert.rejects(
    () =>
      runtime.pool.query(
        "alter table observatory_source add column forbidden text",
      ),
    (error) => error.code === "42501",
  );
  const service = createObservatoryReadService(
    createObservatoryOwnerReadRepository(runtime.db, { environment: "test" }),
    { environment: "test" },
  );
  const scene = (await service.scene({ identity }, {})).scene;
  assert.equal(scene.population.canonicalResourceCount, 91);
  assert.deepEqual(
    scene.membershipIndex.resourceIds,
    fixture.resources.map((item) => item.id).sort(),
  );
  assert.equal(scene.sourceObservations.length, 4);
  assert.equal(
    scene.signals.filter((item) => item.facet === "availability").length,
    0,
  );
  const feed = await service.providerFeed({ identity }, {});
  assert.equal(feed.feed.state, "unknown");
  assert.equal(feed.items.length, 0);
  console.log(
    JSON.stringify({
      scenario: "populated_0067_to_0074_and_repeat",
      result: "PASS",
      postgres: 18,
      resources: 91,
      projects: 15,
      observedHosts: 4,
      preservedMetrics: before.metric_sample.length,
      unchangedLegacyGrants: before.foundation_client.length,
      migrations: journal.entries.length,
      runtimeDdlDenied: true,
      availabilityFabricated: false,
    }),
  );
} finally {
  await runtime?.close();
  await admin?.close();
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
}
