import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, cp, writeFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import EmbeddedPostgres from "embedded-postgres";
import {
  createDatabase,
  migrateDatabase,
  createRealIntegrationRepository,
  createAuth,
} from "../packages/db/src/index.ts";
import {
  project,
  resource,
  projectResourceLink,
} from "../packages/db/src/schema.ts";
import { mixedObservatoryFixture } from "../tests/fixtures/observatory.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidence = join(root, ".agent/observatory-preview");
await mkdir(evidence, { recursive: true });
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  await new Promise((done) => server.close(done));
  if (!address || typeof address === "string")
    throw new Error("Loopback allocation failed");
  return address.port;
}
const directory = await mkdtemp(
  join(tmpdir(), "commandry-observatory-preview-"),
);
const dbPort = await freePort(),
  webPort = await freePort(),
  password = randomBytes(24).toString("hex"),
  runtimePassword = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({
  databaseDir: join(directory, "data"),
  port: dbPort,
  user: "postgres",
  password,
  authMethod: "scram-sha-256",
  persistent: false,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const origin = `http://127.0.0.1:${webPort}`;
let web,
  admin,
  started = false,
  stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (web && web.exitCode === null) {
    web.kill("SIGTERM");
    await Promise.race([
      new Promise((done) => web.once("exit", done)),
      delay(5000).then(() => web.kill("SIGKILL")),
    ]);
  }
  await admin?.close();
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
  await writeFile(
    join(evidence, "stopped.json"),
    JSON.stringify({ stoppedAt: new Date().toISOString(), origin }),
  );
}
process.once("SIGTERM", () => void stop().then(() => process.exit()));
process.once("SIGINT", () => void stop().then(() => process.exit()));
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase("commandry_observatory_preview");
  const adminUrl = `postgresql://postgres:${password}@127.0.0.1:${dbPort}/commandry_observatory_preview`;
  await migrateDatabase({
    connectionString: adminUrl,
    migrationsDir: join(root, "packages/db/migrations"),
  });
  admin = createDatabase({ connectionString: adminUrl, max: 2 });
  const role = "commandry_observatory_preview";
  await admin.pool.query(
    `CREATE ROLE ${role} LOGIN PASSWORD '${runtimePassword}'`,
  );
  await admin.pool.query(
    `GRANT CONNECT ON DATABASE commandry_observatory_preview TO ${role}`,
  );
  await admin.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.pool.query(
    `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
  );
  await admin.pool.query(
    `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
  );
  const fixture = mixedObservatoryFixture();
  await admin.db
    .insert(project)
    .values(fixture.projects.map((p) => ({ id: p.id, name: p.name })));
  await admin.db
    .insert(resource)
    .values(
      fixture.resources.map((r) => ({ id: r.id, name: r.name, kind: r.kind })),
    );
  for (const r of fixture.resources)
    if (r.parentResourceId)
      await admin.pool.query(
        "UPDATE resource SET parent_resource_id=$1 WHERE id=$2",
        [r.parentResourceId, r.id],
      );
  const links = fixture.resources.flatMap((r) =>
    r.projects.map((p) => ({
      id: randomUUID(),
      projectId: p.id,
      resourceId: r.id,
      type: "relates_to",
      sourceKind: "project",
      targetKind: "resource",
      lifecycle: "active",
    })),
  );
  // Two observed fixture hosts have no supplied project link. Explicit synthetic
  // single-project bindings allow the real receiver to validate its source scope.
  const observed = fixture.resources.filter((r) => r.sources.length);
  for (const [index, r] of observed.entries())
    if (!r.projects.length)
      links.push({
        id: randomUUID(),
        projectId: fixture.projects[index + 4].id,
        resourceId: r.id,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
        lifecycle: "active",
      });
  await admin.db.insert(projectResourceLink).values(links);
  const sources = createRealIntegrationRepository(admin.db);
  for (const [index, r] of observed.entries()) {
    const binding = links.find((link) => link.resourceId === r.id);
    const identifier = `synthetic-host-${index + 1}`;
    const source = await sources.create(
      {
        name: "Synthetic recorded host observation",
        kind: "linux-host",
        projectId: binding.projectId,
        resourceId: r.id,
        identifier,
        freshnessWindowMinutes: 10080,
      },
      "synthetic:observatory-preview",
    );
    const token = await sources.rotateToken(
      source.id,
      "synthetic:observatory-preview",
    );
    await sources.receive(source.id, token.token, {
      hostname: identifier,
      sampleId: randomUUID(),
      observedAt: new Date().toISOString(),
      memory: { totalBytes: 17179869184, availableBytes: 8589934592 },
      disk: { totalBytes: 107374182400, availableBytes: 53687091200 },
      uptimeSeconds: 3600,
      load1Milli: 1500,
    });
  }
  const email = "observatory-preview@commandry.test",
    ownerPassword = "Observatory-" + randomBytes(18).toString("hex"),
    secret = randomBytes(32).toString("hex");
  const auth = createAuth({
    db: admin.db,
    secret,
    baseURL: origin,
    adminEmail: email,
    passwordLoginEnabled: true,
    allowBootstrap: true,
    trustedOrigins: [origin],
  });
  await auth.api.signUpEmail({
    body: {
      name: "Synthetic Observatory owner",
      email,
      password: ownerPassword,
    },
    headers: new Headers({ origin }),
  });
  const runtimeUrl = new URL(adminUrl);
  runtimeUrl.username = role;
  runtimeUrl.password = runtimePassword;
  await writeFile(
    join(evidence, "credentials.json"),
    JSON.stringify({ email, password: ownerPassword, origin }),
    { mode: 0o600 },
  );
  const standalone = join(root, "apps/web/.next/standalone/apps/web");
  await mkdir(join(standalone, ".next"), { recursive: true });
  await cp(
    join(root, "apps/web/.next/static"),
    join(standalone, ".next/static"),
    { recursive: true },
  );
  await cp(join(root, "apps/web/public"), join(standalone, "public"), {
    recursive: true,
  });
  const log = createWriteStream(join(evidence, "web.log"), {
    flags: "a",
    mode: 0o600,
  });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  web = spawn(process.execPath, [join(standalone, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_ENV: "test",
      APP_ORIGIN: origin,
      DATABASE_URL: runtimeUrl.toString(),
      BETTER_AUTH_SECRET: secret,
      APP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      INITIAL_ADMIN_EMAIL: email,
      LOCAL_AUTH_MODE: "password",
      PRODUCTION_AUTH_MODE: "disabled",
      PROVIDER_STATUS_POLLING: "false",
      RELEASE_SHA: sha,
      PORT: String(webPort),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  web.stdout.pipe(log);
  web.stderr.pipe(log);
  let ready = false;
  for (let count = 0; count < 100; count++) {
    if (web.exitCode !== null)
      throw new Error("Preview web exited; inspect its task-owned log");
    try {
      ready = (await fetch(origin + "/health/ready")).ok;
    } catch {}
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error("Preview readiness timed out");
  const receipt = {
    origin,
    url: origin + "/infrastructure/wallboard",
    schema: "disposable PostgreSQL18",
    fixture:
      "Synthetic F1 population:91 resources/15 projects/60 repositories/18 hosts/13 services/48 unlinked repositories/7 shared resources/4 recorded host observations; two explicit extra single-project source bindings",
    sourceSha: sha,
    uncommittedCandidate: true,
    pid: process.pid,
    webPid: web.pid,
    startedAt: new Date().toISOString(),
    externalPolling: false,
  };
  await writeFile(
    join(evidence, "receipt.json"),
    JSON.stringify(receipt, null, 2),
  );
  console.log(JSON.stringify(receipt));
  await new Promise((done, reject) => {
    web.once("exit", (code) =>
      code === 0 ? done() : reject(new Error("Preview stopped unexpectedly")),
    );
  });
} finally {
  await stop();
}
