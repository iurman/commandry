import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run pnpm setup first.");
  process.exit(1);
}
process.loadEnvFile(".env.local");
if (process.env.APP_ENV !== "local") {
  console.error("Release rehearsal is limited to APP_ENV=local.");
  process.exit(1);
}
const databaseName = process.env.DB_NAME;
if (!databaseName || !/^[a-z_][a-z0-9_]{0,62}$/.test(databaseName)) {
  console.error("DB_NAME must be a simple local PostgreSQL identifier.");
  process.exit(1);
}
for (const key of [
  "DB_ROOT_PASSWORD",
  "DB_APP_PASSWORD",
  "DB_MIGRATION_PASSWORD",
  "BETTER_AUTH_SECRET",
  "APP_ENCRYPTION_KEY",
]) {
  if (!process.env[key]) {
    console.error(`Missing local configuration: ${key}`);
    process.exit(1);
  }
}
const runtime = detectContainerRuntime();
if (!runtime) {
  console.error("A local Docker-compatible runtime is unavailable.");
  process.exit(1);
}

const id = randomUUID();
const suffix = randomBytes(6).toString("hex");
const network = `cmdry_release_${suffix}`;
const volume = `cmdry_release_${suffix}_data`;
const postgres = `cmdry_release_${suffix}_pg`;
const web = `cmdry_release_${suffix}_web`;
const worker = `cmdry_release_${suffix}_worker`;
const previousTag = `commandry-release-rehearsal:previous-${suffix}`;
const candidateTag = `commandry-release-rehearsal:candidate-${suffix}`;
const compose = ["compose", "--env-file", ".env.local", "-f", "compose.yaml"];
const maxBuffer = 128 * 1024 * 1024;
const startedAt = new Date().toISOString();
let phase = "REVISION_RESOLVE";
let errorCode = null;
let contextDirectory = null;
let networkCreated = false;
let volumeCreated = false;
let previousRevision = null;
let candidateRevision = null;
let previousImageId = null;
let candidateImageId = null;
let sourceSchemaTableCount = 0;
let isolatedSchemaTableCount = 0;
let sourceCaptureSha256 = null;
let isolatedCaptureSha256 = null;
let captureId = null;
const verified = {
  initialWeb: false,
  initialWorker: false,
  candidateWeb: false,
  candidateWorker: false,
  rollbackWeb: false,
  rollbackWorker: false,
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function nullable(value) {
  return value === null ? "null" : quote(value);
}

function normalizedImageId(value) {
  const id = value.trim().replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error(phase);
  return `sha256:${id}`;
}

function run(args, options = {}) {
  const result = runContainer(runtime, args, {
    maxBuffer,
    timeout: 10 * 60 * 1000,
    ...options,
  });
  if (result.error || result.status !== 0) throw new Error(phase);
  return Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout ?? "", "utf8");
}

function localQuery(database, statement) {
  return run([
    ...compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    database,
    "-c",
    statement,
  ])
    .toString("utf8")
    .trim();
}

function isolatedQuery(statement) {
  return run([
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
    databaseName,
    "-c",
    statement,
  ])
    .toString("utf8")
    .trim();
}

function tableCount(query) {
  const count = Number(
    query("select count(*) from pg_tables where schemaname = 'public'"),
  );
  if (!Number.isInteger(count) || count < 1) throw new Error(phase);
  return count;
}

function sampleCapture() {
  const row = localQuery(
    databaseName,
    "select id::text || '|' || encode(convert_to(original_content, 'UTF8'), 'hex') from capture order by id limit 1",
  );
  if (!row) return;
  const separator = row.indexOf("|");
  if (separator < 0) throw new Error(phase);
  const id = row.slice(0, separator);
  const hex = row.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^(?:[0-9a-f]{2})*$/.test(hex))
    throw new Error(phase);
  captureId = id;
  sourceCaptureSha256 = sha256(Buffer.from(hex, "hex"));
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    maxBuffer,
    ...options,
  });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? result.stderr?.toString("utf8"));
    throw new Error(phase);
  }
  return result.stdout;
}

async function buildRevision(revision, tag, directory) {
  await mkdir(directory);
  const archive = git(["archive", "--format=tar", revision]);
  console.log(`Prepared committed source ${revision.slice(0, 8)}.`);
  const extracted = spawnSync("tar", ["-xf", "-", "-C", directory], {
    input: archive,
    maxBuffer,
  });
  if (extracted.error || extracted.status !== 0) {
    console.error(extracted.stderr?.toString("utf8").slice(-1000));
    throw new Error(phase);
  }
  console.log(`Building image from ${revision.slice(0, 8)}...`);
  const build = runContainer(
    runtime,
    [
      "build",
      "--label",
      `org.opencontainers.image.revision=${revision}`,
      "--tag",
      tag,
      directory,
    ],
    { maxBuffer, timeout: 10 * 60 * 1000 },
  );
  if (build.error || build.status !== 0) {
    const output = `${build.stdout?.toString("utf8") ?? ""}\n${build.stderr?.toString("utf8") ?? ""}`;
    console.error(output.split("\n").slice(-18).join("\n"));
    if (build.error) console.error(build.error.message);
    throw new Error(phase);
  }
  console.log(`Built image from ${revision.slice(0, 8)}.`);
  const inspected = runContainer(
    runtime,
    ["image", "inspect", tag, "--format", "{{.Id}}"],
    { maxBuffer: 1024 * 1024 },
  );
  if (inspected.error || inspected.status !== 0) {
    console.error(inspected.stderr?.toString("utf8").slice(-1000));
    throw new Error(phase);
  }
  return normalizedImageId(inspected.stdout.toString("utf8"));
}

async function waitFor(check, attempts = 45) {
  for (let count = 0; count < attempts; count += 1) {
    try {
      if (check()) return;
    } catch {
      // Containers and database endpoints need a bounded startup window.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(phase);
}

function imageMatches(container, expected) {
  const actual = normalizedImageId(
    run(["inspect", container, "--format", "{{.Image}}"]).toString("utf8"),
  );
  return actual === expected;
}

function startApplication(imageId, revision) {
  const startedAt = new Date().toISOString();
  const common = [
    "--network",
    network,
    "-e",
    "APP_ENV=local",
    "-e",
    "APP_ORIGIN=http://127.0.0.1:3000",
    "-e",
    `DATABASE_URL=postgresql://commandry_app:${encodeURIComponent(process.env.DB_APP_PASSWORD)}@postgres:5432/${databaseName}`,
    "-e",
    `BETTER_AUTH_SECRET=${process.env.BETTER_AUTH_SECRET}`,
    "-e",
    `APP_ENCRYPTION_KEY=${process.env.APP_ENCRYPTION_KEY}`,
    "-e",
    `RELEASE_SHA=${revision}`,
    "-e",
    `RELEASE_IMAGE_DIGEST=${imageId}`,
  ];
  run([
    "run",
    "-d",
    "--name",
    web,
    ...common,
    imageId.slice(7),
    "node",
    "apps/web/server.js",
  ]);
  run([
    "run",
    "-d",
    "--name",
    worker,
    ...common,
    imageId.slice(7),
    "node",
    "apps/worker/dist/index.js",
  ]);
  return startedAt;
}

function stopApplication() {
  for (const container of [web, worker]) {
    runContainer(runtime, ["rm", "-f", container], {
      maxBuffer: 1024 * 1024,
    });
  }
}

async function verifyWeb(imageId, revision) {
  const code = `
    Promise.all([
      fetch('http://127.0.0.1:3000/health/ready'),
      fetch('http://127.0.0.1:3000/version'),
      fetch('http://127.0.0.1:3000/api/v1/projects?limit=1')
    ]).then(async ([ready, version, projects]) => {
      const info = await version.json();
      const page = await projects.json();
      process.exitCode = ready.ok && version.ok && projects.ok &&
        info.sha === process.env.RELEASE_SHA &&
        info.imageDigest === process.env.RELEASE_IMAGE_DIGEST &&
        Array.isArray(page.items) ? 0 : 1;
    }).catch(() => { process.exitCode = 1; });
  `;
  await waitFor(() => {
    if (!imageMatches(web, imageId)) return false;
    const result = runContainer(runtime, ["exec", web, "node", "-e", code], {
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    });
    return result.status === 0;
  });
  if (!imageMatches(web, imageId) || !/^[0-9a-f]{40}$/.test(revision))
    throw new Error(phase);
}

async function verifyWorker(imageId, revision, startedAt) {
  await waitFor(() => {
    if (!imageMatches(worker, imageId)) return false;
    return (
      Number(
        isolatedQuery(
          `select count(*) from worker_heartbeat where release_sha = ${quote(revision)} and seen_at > ${quote(startedAt)}::timestamptz`,
        ),
      ) > 0
    );
  });
}

function recordEvidence() {
  phase = "RECORD_EVIDENCE";
  localQuery(
    databaseName,
    `insert into local_release_rehearsal
      (id, outcome, previous_revision, candidate_revision, previous_image_id,
       candidate_image_id, source_schema_table_count, isolated_schema_table_count,
       source_capture_sha256, isolated_capture_sha256, initial_web_verified,
       initial_worker_verified, candidate_web_verified, candidate_worker_verified,
       rollback_web_verified, rollback_worker_verified, error_code, started_at,
       completed_at)
     values (
       ${quote(id)}, ${quote(errorCode ? "failed" : "passed")},
       ${nullable(previousRevision)}, ${nullable(candidateRevision)},
       ${nullable(previousImageId)}, ${nullable(candidateImageId)},
       ${sourceSchemaTableCount}, ${isolatedSchemaTableCount},
       ${nullable(sourceCaptureSha256)}, ${nullable(isolatedCaptureSha256)},
       ${verified.initialWeb}, ${verified.initialWorker},
       ${verified.candidateWeb}, ${verified.candidateWorker},
       ${verified.rollbackWeb}, ${verified.rollbackWorker},
       ${nullable(errorCode)}, ${quote(startedAt)}, ${quote(new Date().toISOString())}
     )`,
  );
}

try {
  const previous = git(["rev-parse", "HEAD^"]).toString("utf8").trim();
  const candidate = git(["rev-parse", "HEAD"]).toString("utf8").trim();
  if (
    !/^[0-9a-f]{40}$/.test(previous) ||
    !/^[0-9a-f]{40}$/.test(candidate) ||
    previous === candidate
  )
    throw new Error(phase);
  previousRevision = previous;
  candidateRevision = candidate;
  contextDirectory = await mkdtemp(join(root, ".agent/release-rehearsal-"));

  phase = "BUILD_PREVIOUS";
  console.log("Building prior committed local image...");
  previousImageId = await buildRevision(
    previous,
    previousTag,
    join(contextDirectory, "previous"),
  );
  phase = "BUILD_CANDIDATE";
  console.log("Building candidate committed local image...");
  candidateImageId = await buildRevision(
    candidate,
    candidateTag,
    join(contextDirectory, "candidate"),
  );
  if (previousImageId === candidateImageId) throw new Error(phase);

  phase = "ISOLATED_CREATE";
  const livePostgres = run([...compose, "ps", "-q", "postgres"])
    .toString("utf8")
    .trim();
  if (!livePostgres) throw new Error(phase);
  const postgresImage = normalizedImageId(
    run(["inspect", livePostgres, "--format", "{{.Image}}"]).toString("utf8"),
  );
  run(["network", "create", network]);
  networkCreated = true;
  run(["volume", "create", volume]);
  volumeCreated = true;
  run([
    "run",
    "-d",
    "--name",
    postgres,
    "--network",
    network,
    "--network-alias",
    "postgres",
    "-e",
    "POSTGRES_USER=postgres",
    "-e",
    `POSTGRES_DB=${databaseName}`,
    "-e",
    `POSTGRES_PASSWORD=${process.env.DB_ROOT_PASSWORD}`,
    "-e",
    "POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256",
    "-v",
    `${volume}:/var/lib/postgresql`,
    postgresImage.slice(7),
  ]);
  await waitFor(() => {
    const result = runContainer(runtime, [
      "exec",
      postgres,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      databaseName,
    ]);
    return result.status === 0;
  });

  phase = "SOURCE_INSPECT";
  sourceSchemaTableCount = tableCount((statement) =>
    localQuery(databaseName, statement),
  );
  sampleCapture();
  phase = "SOURCE_CLONE";
  console.log("Cloning current local data into the isolated database...");
  const dump = run([
    ...compose,
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    databaseName,
    "--no-owner",
    "--no-acl",
    "-Fc",
  ]);
  run(
    [
      "exec",
      "-i",
      postgres,
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      databaseName,
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
    ],
    { input: dump },
  );
  isolatedQuery(
    `create role commandry_app login password ${quote(process.env.DB_APP_PASSWORD)};
     grant connect on database ${databaseName} to commandry_app;
     grant usage on schema public, pgboss to commandry_app;
     grant select, insert, update, delete on all tables in schema public, pgboss to commandry_app;
     grant usage on all sequences in schema public, pgboss to commandry_app;
     grant execute on all functions in schema public, pgboss to commandry_app;`,
  );
  phase = "CLONE_VERIFY";
  isolatedSchemaTableCount = tableCount(isolatedQuery);
  if (captureId) {
    const hex = isolatedQuery(
      `select encode(convert_to(original_content, 'UTF8'), 'hex') from capture where id = ${quote(captureId)}::uuid`,
    );
    if (!/^(?:[0-9a-f]{2})*$/.test(hex)) throw new Error(phase);
    isolatedCaptureSha256 = sha256(Buffer.from(hex, "hex"));
  }
  if (
    isolatedSchemaTableCount !== sourceSchemaTableCount ||
    isolatedCaptureSha256 !== sourceCaptureSha256
  )
    throw new Error(phase);

  phase = "PREVIOUS_START";
  console.log("Checking prior web and worker against the cloned schema...");
  const initialStartedAt = startApplication(previousImageId, previousRevision);
  phase = "PREVIOUS_WEB_VERIFY";
  await verifyWeb(previousImageId, previousRevision);
  verified.initialWeb = true;
  phase = "PREVIOUS_WORKER_VERIFY";
  await verifyWorker(previousImageId, previousRevision, initialStartedAt);
  verified.initialWorker = true;

  phase = "CANDIDATE_START";
  stopApplication();
  console.log(
    "Switching the isolated web and worker to the candidate image...",
  );
  const candidateStartedAt = startApplication(
    candidateImageId,
    candidateRevision,
  );
  phase = "CANDIDATE_WEB_VERIFY";
  await verifyWeb(candidateImageId, candidateRevision);
  verified.candidateWeb = true;
  phase = "CANDIDATE_WORKER_VERIFY";
  await verifyWorker(candidateImageId, candidateRevision, candidateStartedAt);
  verified.candidateWorker = true;

  phase = "ROLLBACK_START";
  stopApplication();
  console.log("Rolling isolated application code back to the prior image...");
  const rollbackStartedAt = startApplication(previousImageId, previousRevision);
  phase = "ROLLBACK_WEB_VERIFY";
  await verifyWeb(previousImageId, previousRevision);
  verified.rollbackWeb = true;
  phase = "ROLLBACK_WORKER_VERIFY";
  await verifyWorker(previousImageId, previousRevision, rollbackStartedAt);
  verified.rollbackWorker = true;
} catch {
  errorCode = phase;
} finally {
  phase = "CLEANUP";
  for (const container of [web, worker, postgres]) {
    const result = runContainer(runtime, ["rm", "-f", container], {
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0 && result.status !== 1) errorCode ??= phase;
  }
  if (networkCreated) {
    const result = runContainer(runtime, ["network", "rm", network]);
    if (result.status !== 0) errorCode ??= phase;
  }
  if (volumeCreated) {
    const result = runContainer(runtime, ["volume", "rm", volume]);
    if (result.status !== 0) errorCode ??= phase;
  }
  for (const tag of [previousTag, candidateTag])
    runContainer(runtime, ["image", "rm", tag], { maxBuffer: 1024 * 1024 });
  if (contextDirectory)
    await rm(contextDirectory, { recursive: true, force: true });
}

try {
  recordEvidence();
} catch {
  console.error("Could not record local release evidence in PostgreSQL.");
  process.exit(1);
}
if (errorCode) {
  console.error(`Local release rehearsal ${id} failed at ${errorCode}.`);
  process.exit(1);
}
console.log(
  `Local release rehearsal ${id} passed: prior, candidate, and rollback web reads and worker heartbeats verified on ${isolatedSchemaTableCount} cloned tables. VPS gates remain unverified.`,
);
