import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtime = detectContainerRuntime();
const startedAt = new Date().toISOString();
const id = randomUUID();
const suffix = randomBytes(6).toString("hex");
const project = `commandry-rehearsal-${suffix}`;
const volume = `commandry_rehearsal_${suffix}_postgres`;
const temporary = resolve(root, `.agent/production-topology-${suffix}`);
const evidenceDirectory = resolve(root, ".agent/production-topology-evidence");
const environmentFile = resolve(temporary, "production.env");
const overrideFile = resolve(temporary, "compose.selinux.yaml");
const caddyImage =
  process.env.COMMANDRY_REHEARSAL_CADDY_IMAGE ??
  "docker.io/library/caddy:2-alpine";
let phase = "preflight";
let environmentWritten = false;
let outcome = "failed";
let errorCode = null;
let cleanupPassed = false;
let revision = null;
let image = null;
let imageId = null;
let sourceTreeClean = false;
let smoke = null;
let caddyProbe = null;
let noPublishedPorts = false;
let redactions = [];
let diagnosticAvailable = false;

function fail(code) {
  throw new Error(code);
}

function container(args, options = {}) {
  const result = runContainer(runtime, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 5 * 60_000,
    ...options,
  });
  if (result.error || result.status !== 0) {
    mkdirSync(evidenceDirectory, { recursive: true, mode: 0o700 });
    let diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (phase === "services") {
      const logs = runContainer(
        runtime,
        [
          "compose",
          "--project-directory",
          root,
          "--env-file",
          environmentFile,
          "-f",
          resolve(root, "compose.production.yaml"),
          "-f",
          overrideFile,
          "-p",
          project,
          "logs",
          "--no-color",
          "--tail",
          "80",
          "postgres",
          "migrate",
          "web",
          "worker",
          "caddy",
        ],
        { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 15_000 },
      );
      diagnostic += `\n${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
    }
    for (const secret of redactions)
      diagnostic = diagnostic.replaceAll(secret, "[redacted]");
    writeFileSync(
      resolve(evidenceDirectory, `${id}.diagnostic.log`),
      diagnostic,
      {
        mode: 0o600,
      },
    );
    diagnosticAvailable = true;
    fail(`${phase.toUpperCase()}_FAILED`);
  }
  return result.stdout.trim();
}

function compose(command, options = {}) {
  return container(
    [
      "compose",
      "--project-directory",
      root,
      "--env-file",
      environmentFile,
      "-f",
      resolve(root, "compose.production.yaml"),
      "-f",
      overrideFile,
      "-p",
      project,
      ...command,
    ],
    options,
  );
}

function lineJson(output) {
  const last = output
    .split("\n")
    .findLast((line) => line.trim().startsWith("{"));
  if (!last) fail(`${phase.toUpperCase()}_RESULT`);
  try {
    return JSON.parse(last);
  } catch {
    fail(`${phase.toUpperCase()}_RESULT`);
  }
}

const caddyReadProgram = String.raw`
const { readFileSync } = require('node:fs');
const input = readFileSync(0, 'utf8').replace(/\r?\n$/, '').split(/\r?\n/);
if (input.length !== 2) process.exit(2);
const [email, password] = input;
const origin = 'https://commandry.rehearsal.test';
const base = 'http://caddy';
const headers = { host: 'commandry.rehearsal.test', origin, 'content-type': 'application/json' };
(async () => {
  const login = await fetch(base + '/api/auth/sign-in/email', {
    method: 'POST', headers, body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(8000)
  });
  if (!login.ok) throw new Error('LOGIN');
  const setCookie = login.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';', 1)[0] || '';
  if (!cookie.includes('session_token=') || !/;\s*Secure(?:;|$)/i.test(setCookie)) throw new Error('COOKIE');
  const read = await fetch(base + '/api/v1/projects?limit=1', {
    headers: { host: headers.host, cookie }, signal: AbortSignal.timeout(8000)
  });
  if (!read.ok || !Array.isArray((await read.json()).items)) throw new Error('API_READ');
  const page = await fetch(base + '/projects', {
    headers: { host: headers.host, cookie }, signal: AbortSignal.timeout(8000)
  });
  if (!page.ok || !(await page.text()).includes('<html')) throw new Error('PAGE_READ');
  const version = await fetch(base + '/version', {
    headers: { host: headers.host }, signal: AbortSignal.timeout(8000)
  });
  const identity = await version.json();
  if (!version.ok || identity.environment !== 'production') throw new Error('VERSION');
  const signOut = await fetch(base + '/api/auth/sign-out', {
    method: 'POST', headers: { ...headers, cookie }, body: '{}',
    signal: AbortSignal.timeout(8000)
  });
  if (!signOut.ok) throw new Error('SIGN_OUT');
  const revoked = await fetch(base + '/api/v1/projects?limit=1', {
    headers: { host: headers.host, cookie }, signal: AbortSignal.timeout(8000)
  });
  if (revoked.status !== 401) throw new Error('SESSION_REMAINS');
  console.log(JSON.stringify({ kind: 'commandry_caddy_auth_rehearsal', outcome: 'passed',
    simulated: true, authenticatedApiRead: true, serverRenderedPage: true,
    secureCookie: true, sessionRevoked: true, releaseSha: identity.sha,
    imageDigest: identity.imageDigest }));
})().catch(() => { console.error('Synthetic Caddy read failed.'); process.exitCode = 1; });
`;

function writeEvidence() {
  mkdirSync(evidenceDirectory, { recursive: true, mode: 0o700 });
  const record = {
    kind: "commandry_production_topology_rehearsal",
    schemaVersion: 1,
    id,
    outcome,
    simulated: true,
    sourceLabel: "Synthetic local production-topology rehearsal",
    startedAt,
    completedAt: new Date().toISOString(),
    phase,
    errorCode,
    revision,
    imageId,
    caddyImage,
    sourceTreeClean,
    localSelinuxMountCopies: true,
    serviceScope: ["postgres", "migrate", "web", "worker", "caddy"],
    offsiteVerified: false,
    vpsVerified: false,
    tunnelVerified: false,
    publicIngressVerified: false,
    noPublishedPorts,
    ownerBootstrapVerified: smoke?.bootstrapCreated === true,
    authenticatedReadVerified:
      smoke?.authenticatedRead === true &&
      caddyProbe?.authenticatedApiRead === true,
    workerJobVerified: Boolean(smoke?.workerJobId),
    caddyServerRenderedPageVerified: caddyProbe?.serverRenderedPage === true,
    sessionRevocationVerified:
      smoke?.probeSessionRevoked === true &&
      caddyProbe?.sessionRevoked === true,
    cleanupPassed,
    diagnosticAvailable,
  };
  writeFileSync(
    resolve(evidenceDirectory, `${id}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
  console.log(JSON.stringify(record));
}

function main() {
  if (process.argv.length !== 2 || !runtime) fail("INVOCATION");
  if (!/^[a-z0-9][a-z0-9./:_-]*$/.test(caddyImage)) fail("CADDY_IMAGE");
  const gitRevision = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  const gitStatus = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  if (gitRevision.status !== 0 || gitStatus.status !== 0) fail("GIT_STATE");
  revision = gitRevision.stdout.trim();
  sourceTreeClean = gitStatus.stdout.trim() === "";
  if (!/^[0-9a-f]{40}$/.test(revision)) fail("GIT_STATE");
  image = `commandry-local:${revision}`;
  const label = container([
    "image",
    "inspect",
    image,
    "--format",
    '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}|{{index .Config.Labels "org.commandry.source.clean"}}',
  ]);
  const [idValue, labelRevision, labelClean] = label.split("|");
  if (
    !/^(?:sha256:)?[0-9a-f]{64}$/.test(idValue ?? "") ||
    labelRevision !== revision ||
    labelClean !== "true"
  )
    fail("SOURCE_IMAGE");
  imageId = `sha256:${idValue.replace(/^sha256:/, "")}`;
  mkdirSync(resolve(root, ".agent"), { recursive: true, mode: 0o700 });
  mkdirSync(temporary, { recursive: false, mode: 0o700 });
  const ownerEmail = "owner@commandry.rehearsal.test";
  const ownerPassword = randomBytes(30).toString("base64url");
  const dbRootPassword = randomBytes(24).toString("hex");
  const dbAppPassword = randomBytes(24).toString("hex");
  const dbMigrationPassword = randomBytes(24).toString("hex");
  const values = {
    COMMANDRY_IMAGE: image,
    CADDY_IMAGE: caddyImage,
    CLOUDFLARED_IMAGE: "docker.io/cloudflare/cloudflared:rehearsal-unused",
    APP_ORIGIN: "https://commandry.rehearsal.test",
    DB_NAME: "commandry",
    DB_ROOT_PASSWORD: dbRootPassword,
    DB_APP_PASSWORD: dbAppPassword,
    DB_MIGRATION_PASSWORD: dbMigrationPassword,
    DATABASE_URL: `postgresql://commandry_app:${dbAppPassword}@postgres:5432/commandry`,
    DATABASE_MIGRATION_URL: `postgresql://commandry_migrate:${dbMigrationPassword}@postgres:5432/commandry`,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    APP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    INITIAL_ADMIN_EMAIL: ownerEmail,
    PRODUCTION_AUTH_MODE: "password",
    RELEASE_SHA: revision,
    RELEASE_BUILD_TIME: new Date().toISOString(),
    PRODUCTION_DB_VOLUME_NAME: volume,
    DB_POOL_MAX: "3",
    BOSS_POOL_MAX: "3",
  };
  redactions = [
    ownerPassword,
    dbRootPassword,
    dbAppPassword,
    dbMigrationPassword,
    values.DATABASE_URL,
    values.DATABASE_MIGRATION_URL,
    values.BETTER_AUTH_SECRET,
    values.APP_ENCRYPTION_KEY,
  ];
  writeFileSync(
    environmentFile,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  cpSync(
    resolve(root, "docker/postgres/initdb"),
    resolve(temporary, "initdb"),
    {
      recursive: true,
    },
  );
  cpSync(resolve(root, "deploy/Caddyfile"), resolve(temporary, "Caddyfile"));
  writeFileSync(
    overrideFile,
    `services:\n  postgres:\n    volumes:\n      - ${resolve(temporary, "initdb")}:/docker-entrypoint-initdb.d:ro,Z\n  caddy:\n    volumes:\n      - ${resolve(temporary, "Caddyfile")}:/etc/caddy/Caddyfile:ro,Z\n`,
    { mode: 0o600 },
  );
  environmentWritten = true;

  phase = "compose_shape";
  const config = JSON.parse(compose(["config", "--format", "json"]));
  const services = config.services ?? {};
  const expected = [
    "caddy",
    "cloudflared",
    "migrate",
    "postgres",
    "web",
    "worker",
  ];
  if (JSON.stringify(Object.keys(services).sort()) !== JSON.stringify(expected))
    fail("TOPOLOGY");
  for (const name of expected) {
    if (services[name]?.build || services[name]?.ports?.length)
      fail("EXPOSURE");
  }
  if (
    services.web.image !== services.worker.image ||
    services.web.image !== services.migrate.image ||
    services.web.image !== image
  )
    fail("IMAGE_PARITY");
  console.log(
    "Synthetic production Compose shape passed; Tunnel will not start.",
  );

  phase = "services";
  compose([
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "180",
    "postgres",
    "migrate",
    "web",
    "worker",
    "caddy",
  ]);
  const running = container([
    "ps",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--format",
    "{{.Names}}|{{.Ports}}",
  ]);
  if (
    !running.includes(`${project}-web-`) ||
    !running.includes(`${project}-worker-`) ||
    !running.includes(`${project}-caddy-`) ||
    running.includes("->")
  )
    fail("SERVICE_EXPOSURE");
  noPublishedPorts = true;
  console.log(
    "Synthetic production services are healthy with no published ports.",
  );

  phase = "owner_and_worker_smoke";
  smoke = lineJson(
    compose(
      [
        "run",
        "--rm",
        "--no-deps",
        "-T",
        "worker",
        "node",
        "apps/worker/dist/deployment-smoke.js",
        image,
        revision,
      ],
      { input: `${ownerEmail}\n${ownerPassword}\n`, timeout: 90_000 },
    ),
  );
  if (
    smoke.kind !== "commandry_deployment_smoke" ||
    smoke.outcome !== "passed" ||
    smoke.environment !== "production" ||
    smoke.imageDigest !== image ||
    smoke.releaseSha !== revision ||
    smoke.bootstrapCreated !== true ||
    smoke.authenticatedRead !== true ||
    smoke.probeSessionRevoked !== true ||
    !smoke.workerJobId
  )
    fail("OWNER_SMOKE_RESULT");
  console.log("Synthetic owner login, protected read, and worker job passed.");

  phase = "caddy_read";
  caddyProbe = lineJson(
    compose(["exec", "-T", "web", "node", "-e", caddyReadProgram], {
      input: `${ownerEmail}\n${ownerPassword}\n`,
      timeout: 45_000,
    }),
  );
  if (
    caddyProbe.kind !== "commandry_caddy_auth_rehearsal" ||
    caddyProbe.outcome !== "passed" ||
    caddyProbe.releaseSha !== revision ||
    caddyProbe.imageDigest !== image ||
    caddyProbe.authenticatedApiRead !== true ||
    caddyProbe.serverRenderedPage !== true ||
    caddyProbe.secureCookie !== true ||
    caddyProbe.sessionRevoked !== true
  )
    fail("CADDY_READ_RESULT");
  console.log(
    "Synthetic Caddy login, API read, page read, and sign-out passed.",
  );
  outcome = "passed";
}

try {
  main();
} catch (error) {
  errorCode = /^[A-Z_]+$/.test(error?.message ?? "")
    ? error.message
    : `${phase.toUpperCase()}_FAILED`;
  console.error(
    `Synthetic production topology rehearsal failed at ${phase}: ${errorCode}.`,
  );
  process.exitCode = 1;
} finally {
  if (environmentWritten) {
    const completedPhase = phase;
    phase = "cleanup";
    const down = runContainer(
      runtime,
      [
        "compose",
        "--project-directory",
        root,
        "--env-file",
        environmentFile,
        "-f",
        resolve(root, "compose.production.yaml"),
        "-f",
        overrideFile,
        "-p",
        project,
        "down",
        "--volumes",
        "--remove-orphans",
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 2 * 60_000 },
    );
    const remaining = runContainer(
      runtime,
      [
        "ps",
        "-a",
        "--filter",
        `label=com.docker.compose.project=${project}`,
        "--format",
        "{{.Names}}",
      ],
      { encoding: "utf8", timeout: 15_000 },
    );
    const retainedVolume = runContainer(
      runtime,
      ["volume", "inspect", volume],
      {
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    const retainedNetwork = runContainer(
      runtime,
      ["network", "inspect", `${project}_default`],
      { encoding: "utf8", timeout: 15_000 },
    );
    cleanupPassed =
      down.status === 0 &&
      remaining.status === 0 &&
      remaining.stdout.trim() === "" &&
      retainedVolume.status !== 0 &&
      retainedNetwork.status !== 0;
    if (!cleanupPassed) {
      outcome = "failed";
      errorCode ??= "CLEANUP_FAILED";
      process.exitCode = 1;
    }
    phase = completedPhase;
  }
  rmSync(temporary, { recursive: true, force: true });
  writeEvidence();
}
