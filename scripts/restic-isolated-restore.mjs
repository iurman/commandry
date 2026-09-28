import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectContainerRuntime } from "./container-runtime.mjs";
import { parseR2Repository } from "./r2-repository.mjs";
import { pipeAndHash } from "./stream-process.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const production = process.env.APP_ENV === "production";
if (!process.env.APP_ENV && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
for (const name of [
  "DB_ROOT_PASSWORD",
  "DB_APP_PASSWORD",
  "DB_MIGRATION_PASSWORD",
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "BETTER_AUTH_SECRET",
  "APP_ENCRYPTION_KEY",
  "INITIAL_ADMIN_EMAIL",
]) {
  delete process.env[name];
}

const id = randomUUID();
const suffix = randomBytes(6).toString("hex");
const network = `cmdry_restic_${suffix}`;
const volume = `cmdry_restic_${suffix}_data`;
const postgres = `cmdry_restic_${suffix}_pg`;
const web = `cmdry_restic_${suffix}_web`;
const startedAt = new Date().toISOString();
const startedMs = Date.now();
let phase = "CONFIG";
let failureCode = null;
let runtime = null;
let directory = null;
let networkCreated = false;
let volumeCreated = false;
let postgresStarted = false;
let webStarted = false;
const evidence = {
  kind: "commandry_restic_isolated_restore",
  id,
  outcome: "failed",
  startedAt,
  sourceLabel: process.env.RECOVERY_SOURCE_LABEL || "unverified-snapshot",
  environment: process.env.APP_ENV ?? null,
  snapshotId: process.argv[2] ?? null,
  snapshotTime: null,
  snapshotAgeAtStartMs: null,
  resources: { network, volume, postgres, web },
  dumpSha256: null,
  imageRevision: null,
  postgresImageId: null,
  webImageId: null,
  publicTableCount: null,
  projectCount: null,
  captureCount: null,
  workCount: null,
  networkInternal: false,
  publishedPorts: null,
  webSmoke: null,
  restoreDurationMs: null,
  recoveryDurationMs: null,
  totalDurationMs: null,
  resourcesRemoved: false,
  offsiteVerified: false,
  vpsVerified: false,
  failureCode: null,
};

function fail(code) {
  throw new Error(code);
}

function checkedImageId(value) {
  const id = value.trim().replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(id)) fail(phase);
  return `sha256:${id}`;
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 15_000,
    ...options,
  });
  if (result.error || result.status !== 0) fail(phase);
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run(runtime.command, [...runtime.prefix, ...args], options);
}

function dockerProbe(args, options = {}) {
  return spawnSync(runtime.command, [...runtime.prefix, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 5_000,
    ...options,
  });
}

function databaseQuery(statement) {
  return docker([
    "exec",
    postgres,
    "psql",
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    process.env.DB_NAME,
    "-c",
    statement,
  ]);
}

function sample(table, column) {
  const value = databaseQuery(
    `select id::text || '|' || encode(convert_to(left(${column}, 4096), 'UTF8'), 'hex') from ${table} order by id limit 1`,
  );
  if (!value) return null;
  const separator = value.indexOf("|");
  if (separator < 0) fail(phase);
  const id = value.slice(0, separator);
  const hex = value.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^(?:[0-9a-f]{2})*$/.test(hex))
    fail(phase);
  return { id, prefix: Buffer.from(hex, "hex").toString("utf8") };
}

function resticConfig() {
  if (process.argv.length < 3 || process.argv.length > 4)
    fail("Usage: restic-isolated-restore.mjs <snapshot-id> [dump-sha256]");
  if (!/^[0-9a-f]{64}$/.test(process.argv[2]))
    fail("A full restic snapshot ID is required");
  if (process.argv[3] && !/^[0-9a-f]{64}$/.test(process.argv[3]))
    fail("Expected dump SHA-256 must be a full digest");
  if (process.env.APP_ENV !== "local" && !production)
    fail("Isolated restore requires APP_ENV=local or production");
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(process.env.DB_NAME || ""))
    fail("DB_NAME must be a simple PostgreSQL identifier");
  if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(evidence.sourceLabel))
    fail("RECOVERY_SOURCE_LABEL is invalid");
  if (!process.env.RESTIC_REPOSITORY || process.env.RESTIC_PASSWORD)
    fail("RESTIC_REPOSITORY and a dedicated password file are required");
  const passwordFile = process.env.RESTIC_PASSWORD_FILE;
  if (!passwordFile || !isAbsolute(passwordFile))
    fail("RESTIC_PASSWORD_FILE must be absolute");
  const entry = lstatSync(passwordFile);
  if (
    !entry.isFile() ||
    entry.size < 32 ||
    (entry.mode & 0o077) !== 0 ||
    (production && entry.uid !== 0)
  )
    fail("RESTIC_PASSWORD_FILE must be a private regular file");
  const composeEnvFile = production
    ? "/etc/commandry/commandry.env"
    : resolve(root, ".env.local");
  if (!existsSync(composeEnvFile)) fail("Compose environment is missing");
  if (production) {
    const composeEnvEntry = lstatSync(composeEnvFile);
    if (
      !composeEnvEntry.isFile() ||
      composeEnvEntry.uid !== 0 ||
      (composeEnvEntry.mode & 0o077) !== 0 ||
      !parseR2Repository(process.env.RESTIC_REPOSITORY) ||
      !/^ghcr\.io\/[^\s@]+@sha256:[0-9a-f]{64}$/.test(
        process.env.RECOVERY_WEB_IMAGE ?? "",
      ) ||
      !/^[0-9a-f]{40}$/.test(process.env.RECOVERY_WEB_REVISION ?? "") ||
      process.env.RECOVERY_EVIDENCE_DIR !==
        "/var/lib/commandry/recovery-evidence"
    )
      fail("Production restore configuration is invalid");
  }
  runtime = detectContainerRuntime();
  if (!runtime) fail("A Docker-compatible runtime is unavailable");
  const candidates = process.env.RESTIC_BINARY
    ? [{ executable: process.env.RESTIC_BINARY, prefix: [] }]
    : [
        { executable: "restic", prefix: [] },
        {
          executable: "flatpak-spawn",
          prefix: ["--host", "/home/linuxbrew/.linuxbrew/bin/restic"],
        },
      ];
  const restic = candidates.find(
    (candidate) =>
      spawnSync(candidate.executable, [...candidate.prefix, "version"], {
        stdio: "ignore",
      }).status === 0,
  );
  if (!restic) fail("restic is unavailable");
  return [
    restic.executable,
    [
      ...restic.prefix,
      "--repo",
      process.env.RESTIC_REPOSITORY,
      "--password-file",
      passwordFile,
    ],
  ];
}

async function waitFor(check, durationMs) {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  fail(phase);
}

const smokeCode = `
  (async () => {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const expected = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const get = async (path) => {
      const response = await fetch('http://127.0.0.1:3000' + path, {
        signal: AbortSignal.timeout(4000),
      });
      return { ok: response.ok, body: await response.json() };
    };
    const live = await get('/health/live');
    const ready = await get('/health/ready');
    const version = await get('/version');
    const list = await get('/api/v1/projects?limit=1');
    const project = expected.project
      ? await get('/api/v1/projects/' + expected.project.id)
      : null;
    const capture = expected.capture
      ? await get('/api/v1/captures/' + expected.capture.id)
      : null;
    const result = {
      live: live.ok && live.body.status === 'alive',
      ready: ready.ok && ready.body.status === 'ready',
      version: version.ok && version.body.sha === expected.revision &&
        version.body.imageDigest === expected.imageId,
      projectList: list.ok && Array.isArray(list.body.items),
      projectRead: project === null ? null : project.ok &&
        project.body.id === expected.project.id &&
        project.body.name.startsWith(expected.project.prefix),
      captureRead: capture === null ? null : capture.ok &&
        capture.body.id === expected.capture.id &&
        capture.body.originalContent.startsWith(expected.capture.prefix),
    };
    console.log(JSON.stringify(result));
    process.exitCode = Object.values(result).every((value) => value !== false) ? 0 : 1;
  })().catch(() => { process.exitCode = 1; });
`;

async function isolate(restic) {
  phase = "SNAPSHOT_METADATA";
  const snapshots = JSON.parse(
    run(restic[0], [...restic[1], "snapshots", "--json", process.argv[2]], {
      timeout: 60_000,
    }),
  );
  const snapshot = snapshots.find((item) => item.id === process.argv[2]);
  const snapshotMs = Date.parse(snapshot?.time || "");
  if (
    !snapshot ||
    !snapshot.paths?.includes("/commandry.dump") ||
    !snapshot.tags?.includes("commandry-postgres") ||
    !Number.isFinite(snapshotMs)
  )
    fail(phase);
  evidence.snapshotTime = snapshot.time;
  evidence.snapshotAgeAtStartMs = startedMs - snapshotMs;

  phase = "SOURCE_IMAGES";
  const compose = [
    "compose",
    "--env-file",
    production ? "/etc/commandry/commandry.env" : ".env.local",
    "-f",
    production ? "compose.production.yaml" : "compose.yaml",
  ];
  const postgresContainer = docker([...compose, "ps", "-q", "postgres"]);
  const webContainer = production
    ? null
    : docker([...compose, "ps", "-q", "web"]);
  if (!postgresContainer || (!production && !webContainer)) fail(phase);
  const postgresImageId = checkedImageId(
    docker(["inspect", postgresContainer, "--format", "{{.Image}}"]),
  );
  if (production) {
    const repoDigests = docker([
      "image",
      "inspect",
      process.env.RECOVERY_WEB_IMAGE,
      "--format",
      "{{range .RepoDigests}}{{println .}}{{end}}",
    ]).split("\n");
    if (!repoDigests.includes(process.env.RECOVERY_WEB_IMAGE))
      fail("SOURCE_IMAGE_UNVERIFIED");
  }
  const webImageId = checkedImageId(
    production
      ? docker([
          "image",
          "inspect",
          process.env.RECOVERY_WEB_IMAGE,
          "--format",
          "{{.Id}}",
        ])
      : docker(["inspect", webContainer, "--format", "{{.Image}}"]),
  );
  const labels = JSON.parse(
    docker(["image", "inspect", webImageId, "--format", "{{json .Labels}}"]),
  );
  const revision = labels["org.opencontainers.image.revision"];
  if (
    labels["org.commandry.source.clean"] !== "true" ||
    !/^[0-9a-f]{40}$/.test(revision) ||
    (production && revision !== process.env.RECOVERY_WEB_REVISION)
  )
    fail("SOURCE_IMAGE_UNVERIFIED");
  evidence.postgresImageId = postgresImageId;
  evidence.webImageId = webImageId;
  evidence.imageRevision = revision;

  phase = "ISOLATED_NETWORK";
  docker(["network", "create", "--internal", network]);
  networkCreated = true;
  evidence.networkInternal =
    docker([
      "network",
      "inspect",
      network,
      "--format",
      "{{.Internal}}",
    ]).toLowerCase() === "true";
  if (!evidence.networkInternal) fail(phase);

  phase = "ISOLATED_VOLUME";
  docker(["volume", "create", volume]);
  volumeCreated = true;
  directory = await mkdtemp(resolve(root, ".agent/restic-isolated-"));
  const postgresPassword = randomBytes(24).toString("hex");
  const appPassword = randomBytes(24).toString("hex");
  const postgresEnv = resolve(directory, "postgres.env");
  const webEnv = resolve(directory, "web.env");
  await writeFile(
    postgresEnv,
    [
      "POSTGRES_USER=postgres",
      `POSTGRES_DB=${process.env.DB_NAME}`,
      `POSTGRES_PASSWORD=${postgresPassword}`,
      "POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  phase = "ISOLATED_POSTGRES";
  docker([
    "run",
    "-d",
    "--name",
    postgres,
    "--network",
    network,
    "--network-alias",
    "postgres",
    "--env-file",
    postgresEnv,
    "-v",
    `${volume}:/var/lib/postgresql`,
    postgresImageId,
  ]);
  postgresStarted = true;
  await waitFor(
    () =>
      dockerProbe([
        "exec",
        postgres,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-d",
        process.env.DB_NAME,
      ]).status === 0,
    45_000,
  );

  phase = "RESTORE_STREAM";
  const restoreStartedMs = Date.now();
  const dumpSha256 = await pipeAndHash(
    [restic[0], [...restic[1], "dump", process.argv[2], "/commandry.dump"]],
    [
      runtime.command,
      [
        ...runtime.prefix,
        "exec",
        "-i",
        postgres,
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        process.env.DB_NAME,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ],
    ],
    root,
  );
  evidence.restoreDurationMs = Date.now() - restoreStartedMs;
  evidence.dumpSha256 = dumpSha256;
  if (process.argv[3] && dumpSha256 !== process.argv[3]) fail("RESTORE_DIGEST");

  phase = "RESTORED_DATA";
  const counts = databaseQuery(
    "select (select count(*) from pg_tables where schemaname = 'public') || '|' || (select count(*) from project) || '|' || (select count(*) from capture) || '|' || (select count(*) from work_item)",
  )
    .split("|")
    .map(Number);
  if (
    counts.length !== 4 ||
    counts[0] < 1 ||
    !counts.every((value) => Number.isSafeInteger(value) && value >= 0)
  )
    fail(phase);
  [
    evidence.publicTableCount,
    evidence.projectCount,
    evidence.captureCount,
    evidence.workCount,
  ] = counts;
  const project = sample("project", "name");
  const capture = sample("capture", "original_content");

  phase = "READ_ONLY_APP_ROLE";
  const roleSql = `
    create role commandry_app login password '${appPassword}';
    grant connect on database "${process.env.DB_NAME}" to commandry_app;
    grant usage on schema public, pgboss to commandry_app;
    grant select on all tables in schema public, pgboss to commandry_app;
    grant usage on all sequences in schema public, pgboss to commandry_app;
    alter role commandry_app set default_transaction_read_only = on;
  `;
  docker(
    [
      "exec",
      "-i",
      postgres,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      process.env.DB_NAME,
      "-f",
      "-",
    ],
    { input: roleSql },
  );

  phase = "ISOLATED_WEB";
  await writeFile(
    webEnv,
    [
      "APP_ENV=local",
      "APP_ORIGIN=http://127.0.0.1:3000",
      `DATABASE_URL=postgresql://commandry_app:${appPassword}@postgres:5432/${process.env.DB_NAME}`,
      `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
      `APP_ENCRYPTION_KEY=${randomBytes(48).toString("base64url")}`,
      "LOCAL_AUTH_MODE=off",
      `RELEASE_SHA=${revision}`,
      `RELEASE_IMAGE_DIGEST=${production ? process.env.RECOVERY_WEB_IMAGE : webImageId}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  docker([
    "run",
    "-d",
    "--name",
    web,
    "--network",
    network,
    "--env-file",
    webEnv,
    webImageId,
    "node",
    "apps/web/server.js",
  ]);
  webStarted = true;
  const ports = docker([
    "inspect",
    web,
    "--format",
    "{{json .HostConfig.PortBindings}}",
  ]);
  evidence.publishedPorts = ports;
  if (ports !== "{}" && ports !== "null") fail("WEB_PORT_EXPOSED");

  phase = "APPLICATION_SMOKE";
  const expected = JSON.stringify({
    project,
    capture,
    revision,
    imageId: production ? process.env.RECOVERY_WEB_IMAGE : webImageId,
  });
  let smoke = null;
  await waitFor(() => {
    const result = dockerProbe(["exec", "-i", web, "node", "-e", smokeCode], {
      input: expected,
    });
    if (result.status !== 0) return false;
    try {
      smoke = JSON.parse(result.stdout.trim());
      return true;
    } catch {
      return false;
    }
  }, 45_000);
  evidence.webSmoke = smoke;
  evidence.recoveryDurationMs = Date.now() - startedMs;
  evidence.outcome = "passed";
}

function removeResource(args) {
  const result = dockerProbe(args);
  return result.status === 0;
}

async function cleanup() {
  if (runtime) {
    if (webStarted) removeResource(["rm", "-f", web]);
    if (postgresStarted) removeResource(["rm", "-f", postgres]);
    if (networkCreated) removeResource(["network", "rm", network]);
    if (volumeCreated) removeResource(["volume", "rm", volume]);
    evidence.resourcesRemoved =
      (!webStarted || dockerProbe(["inspect", web]).status !== 0) &&
      (!postgresStarted || dockerProbe(["inspect", postgres]).status !== 0) &&
      (!networkCreated ||
        dockerProbe(["network", "inspect", network]).status !== 0) &&
      (!volumeCreated ||
        dockerProbe(["volume", "inspect", volume]).status !== 0);
  }
  if (directory) await rm(directory, { recursive: true, force: true });
  if (!evidence.resourcesRemoved && (networkCreated || volumeCreated)) {
    evidence.outcome = "failed";
    failureCode = "CLEANUP";
  }
}

try {
  const restic = resticConfig();
  await isolate(restic);
} catch (error) {
  failureCode = /^[A-Z_]+$/.test(error?.message || "") ? error.message : phase;
} finally {
  try {
    await cleanup();
  } catch {
    failureCode = "CLEANUP";
    evidence.outcome = "failed";
  }
  evidence.completedAt = new Date().toISOString();
  evidence.totalDurationMs = Date.now() - startedMs;
  evidence.failureCode = failureCode;
  evidence.offsiteVerified =
    evidence.outcome === "passed" &&
    evidence.resourcesRemoved &&
    production &&
    Boolean(parseR2Repository(process.env.RESTIC_REPOSITORY));
  const evidenceDirectory = production
    ? "/var/lib/commandry/recovery-evidence"
    : resolve(root, ".agent/restic-recovery-evidence");
  try {
    await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
    const entry = lstatSync(evidenceDirectory);
    if (!entry.isDirectory() || (entry.mode & 0o077) !== 0)
      fail("EVIDENCE_DIRECTORY");
    const file = resolve(evidenceDirectory, `${id}.json`);
    await writeFile(file, `${JSON.stringify(evidence, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    evidence.evidencePath = file;
  } catch {
    evidence.outcome = "failed";
    evidence.failureCode = "EVIDENCE_WRITE";
  }
  const output = JSON.stringify(evidence);
  if (evidence.outcome === "passed" && evidence.resourcesRemoved) {
    console.log(output);
  } else {
    console.error(output);
    process.exitCode = 1;
  }
}
