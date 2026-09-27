import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessLocalReleaseCandidate } from "../packages/domain/src/local-release-preflight.ts";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";
import { getLocalSourceState } from "./local-source-provenance.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run pnpm setup first.");
  process.exit(1);
}
process.loadEnvFile(".env.local");
if (process.env.APP_ENV !== "local") {
  console.error("Release preflight is limited to APP_ENV=local.");
  process.exit(1);
}
const databaseName = process.env.DB_NAME;
if (!databaseName || !/^[a-z_][a-z0-9_]{0,62}$/.test(databaseName)) {
  console.error("DB_NAME must be a simple local PostgreSQL identifier.");
  process.exit(1);
}
const runtime = detectContainerRuntime();
if (!runtime) {
  console.error("A local Docker-compatible runtime is unavailable.");
  process.exit(1);
}

const id = randomUUID();
const startedAt = new Date().toISOString();
const compose = ["compose", "--env-file", ".env.local", "-f", "compose.yaml"];
const localOrigin = "http://127.0.0.1:3010";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function run(args) {
  const result = runContainer(runtime, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 15_000,
  });
  return result.error || result.status !== 0 ? null : result.stdout.trim();
}

function serviceId(name) {
  const value = run([...compose, "ps", "-a", "-q", name]);
  return value && /^[0-9a-f]{12,64}$/.test(value) ? value : null;
}

function inspect(containerId, format) {
  return containerId ? run(["inspect", "--format", format, containerId]) : null;
}

function normalizedImageId(value) {
  const id = value?.replace(/^sha256:/, "");
  return id && /^[0-9a-f]{64}$/.test(id) ? `sha256:${id}` : null;
}

function imageSourceLabels(containerId) {
  const raw = inspect(containerId, "{{json .Config.Labels}}");
  try {
    const labels = JSON.parse(raw);
    const revision = labels?.["org.opencontainers.image.revision"];
    const clean = labels?.["org.commandry.source.clean"];
    return {
      revision:
        typeof revision === "string" && /^[0-9a-f]{40}$/.test(revision)
          ? revision
          : null,
      clean: clean === "true" ? true : clean === "false" ? false : null,
    };
  } catch {
    return { revision: null, clean: null };
  }
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNullable(value) {
  return value === null ? "null" : sqlQuote(value);
}

function sqlNullableBoolean(value) {
  return value === null ? "null" : String(value);
}

function localQuery(statement) {
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
    databaseName,
    "-c",
    statement,
  ]);
}

async function getJson(path) {
  try {
    const response = await fetch(`${localOrigin}${path}`, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    return { status: response.status, body: await response.json() };
  } catch {
    return { status: 0, body: null };
  }
}

async function latestEvidence(path) {
  const response = await getJson(`${path}?limit=1`);
  const item = response.body?.items?.[0];
  return {
    id:
      typeof item?.id === "string" && uuidPattern.test(item.id)
        ? item.id
        : null,
    passed: response.status === 200 && item?.outcome === "passed",
  };
}

const postgresId = serviceId("postgres");
const webId = serviceId("web");
const workerId = serviceId("worker");
const migrateId = serviceId("migrate");
const imageId = normalizedImageId(inspect(webId, "{{.Image}}"));
const workerImageId = normalizedImageId(inspect(workerId, "{{.Image}}"));
const imageSource = imageSourceLabels(webId);
let checkout = null;
try {
  checkout = getLocalSourceState();
} catch {
  checkout = null;
}
const checkoutRevision = checkout?.revision ?? null;
const checkoutClean = checkout?.clean ?? false;

const [live, ready, version, projects, backup, recovery, release] =
  await Promise.all([
    getJson("/health/live"),
    getJson("/health/ready"),
    getJson("/version"),
    getJson("/api/v1/projects?limit=1"),
    latestEvidence("/api/v1/local-backups"),
    latestEvidence("/api/v1/local-recovery-drills"),
    latestEvidence("/api/v1/local-release-rehearsals"),
  ]);
const versionSha =
  version.status === 200 &&
  typeof version.body?.sha === "string" &&
  /^[a-zA-Z0-9._-]{1,128}$/.test(version.body.sha)
    ? version.body.sha
    : null;
const heartbeatFresh =
  localQuery(
    "select coalesce(bool_or(seen_at > now() - interval '30 seconds'), false) from worker_heartbeat",
  ) === "t";
const checks = {
  postgresHealthy:
    inspect(postgresId, "{{.State.Health.Status}}") === "healthy",
  webHealthy: inspect(webId, "{{.State.Health.Status}}") === "healthy",
  workerHealthy: inspect(workerId, "{{.State.Health.Status}}") === "healthy",
  migrationExited:
    inspect(migrateId, "{{.State.Status}}|{{.State.ExitCode}}") === "exited|0",
  revisionKnown: checkoutRevision !== null,
  sameImage: imageId !== null && imageId === workerImageId,
  versionReachable:
    live.status === 200 &&
    live.body?.status === "alive" &&
    ready.status === 200 &&
    ready.body?.status === "ready" &&
    versionSha !== null &&
    version.body?.environment === "local",
  apiRead: projects.status === 200 && Array.isArray(projects.body?.items),
  heartbeatFresh,
  localEvidence: backup.passed && recovery.passed && release.passed,
};
const sourceVerified =
  checkoutClean &&
  imageSource.clean === true &&
  imageSource.revision !== null &&
  imageSource.revision === checkoutRevision &&
  versionSha === checkoutRevision &&
  checks.sameImage;
const assessment = assessLocalReleaseCandidate(checks, sourceVerified);
const completedAt = new Date().toISOString();
const persisted = localQuery(
  `insert into local_release_preflight
    (id, outcome, source_evidence_version, checkout_revision, image_id,
     version_sha, image_source_revision, image_source_clean, checkout_clean,
     source_verified, checks,
     backup_evidence_id, recovery_evidence_id, release_evidence_id,
     error_code, started_at, completed_at)
   values (
     ${sqlQuote(id)}, ${sqlQuote(assessment.outcome)}, 2,
     ${sqlNullable(checkoutRevision)},
     ${sqlNullable(imageId)},
     ${sqlNullable(versionSha)}, ${sqlNullable(imageSource.revision)},
     ${sqlNullableBoolean(imageSource.clean)}, ${checkoutClean},
     ${sourceVerified}, ${sqlQuote(JSON.stringify(checks))}::jsonb,
     ${sqlNullable(backup.id)}, ${sqlNullable(recovery.id)},
     ${sqlNullable(release.id)}, ${sqlNullable(assessment.errorCode)},
     ${sqlQuote(startedAt)}, ${sqlQuote(completedAt)}
   ) returning id`,
);
if (persisted?.split("\n")[0] !== id) {
  console.error("Could not record local preflight evidence in PostgreSQL.");
  process.exit(2);
}
console.log(
  JSON.stringify({
    id,
    outcome: assessment.outcome,
    errorCode: assessment.errorCode,
    checks,
    imageSourceRevision: imageSource.revision,
    imageSourceClean: imageSource.clean,
    checkoutClean,
    sourceVerified,
    productionReady: false,
  }),
);
if (assessment.outcome === "failed") process.exitCode = 1;
