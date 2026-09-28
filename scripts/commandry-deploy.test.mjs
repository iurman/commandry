import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repository = resolve(import.meta.dirname, "..");
const deployScript = join(repository, "deploy/commandry-deploy.sh");
const oldImage = `ghcr.io/example/commandry@sha256:${"1".repeat(64)}`;
const newImage = `ghcr.io/example/commandry@sha256:${"a".repeat(64)}`;
const revision = "b".repeat(40);
const secret = "SYNTHETIC_SECRET_DO_NOT_LOG";
const priorBootstrapId = "c".repeat(32);
const priorClusterId = "7411111111111111111";

const fakeDocker = String.raw`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$COMMANDRY_TEST_ROOT/docker.calls"
printf '%s\n' "$*" >> "$COMMANDRY_TEST_ROOT/sequence.calls"
if [[ -f "$COMMANDRY_TEST_ROOT/fail-command" ]]; then
  pattern=$(cat "$COMMANDRY_TEST_ROOT/fail-command")
  [[ "$*" != *"$pattern"* ]] || exit 29
fi
if [[ "$1" == volume ]]; then
  case "$2" in
    ls)
      if [[ -f "$COMMANDRY_TEST_ROOT/volume-created" ]]; then
        printf 'commandry-production-postgres\n'
      fi
      ;;
    create)
      if [[ ! -f "$COMMANDRY_TEST_ROOT/volume-created" ]]; then
        for argument in "$@"; do
          if [[ "$argument" == org.commandry.bootstrap-id=* ]]; then
            printf '%s\n' "$argument" | cut -d= -f2- > "$COMMANDRY_TEST_ROOT/volume-created"
          fi
        done
      fi
      printf 'commandry-production-postgres\n'
      ;;
    inspect)
      if [[ -f "$COMMANDRY_TEST_ROOT/volume-created" ]]; then
        printf 'local|commandry|postgres_data|%s\n' "$(cat "$COMMANDRY_TEST_ROOT/volume-created")"
      else
        exit 1
      fi
      ;;
  esac
  exit 0
fi
if [[ "$1" == image && "$2" == inspect && "$#" -ge 3 && "$3" == --format ]]; then
  case "$4" in
    '{{range .RepoDigests}}{{println .}}{{end}}')
      awk -F= '$1 == "IMAGE" { print $2 }' "$COMMANDRY_TEST_ROOT/etc/commandry/approved-release"
      ;;
    '{{index .Config.Labels "org.opencontainers.image.revision"}}')
      if [[ -f "$COMMANDRY_TEST_ROOT/wrong-revision" ]]; then printf 'wrong\n';
      else awk -F= '$1 == "REVISION" { print $2 }' "$COMMANDRY_TEST_ROOT/etc/commandry/approved-release"; fi
      ;;
    '{{index .Config.Labels "org.commandry.source.clean"}}') printf 'true\n' ;;
  esac
fi
if [[ "$*" == *'up -d --wait --wait-timeout 120 postgres'* && \
  ! -f "$COMMANDRY_TEST_ROOT/cluster-id" ]]; then
  printf '7411111111111111111\n' > "$COMMANDRY_TEST_ROOT/cluster-id"
fi
if [[ "$*" == *'exec -T postgres psql'* && "$*" == *pg_control_system* ]]; then
  cat "$COMMANDRY_TEST_ROOT/cluster-id"
fi
if [[ "$*" == *'ps --status running --services caddy cloudflared'* && \
  ! -f "$COMMANDRY_TEST_ROOT/ingress-was-stopped" ]]; then
  if [[ -f "$COMMANDRY_TEST_ROOT/var/lib/commandry/current-release" || \
    -f "$COMMANDRY_TEST_ROOT/unexpected-ingress" ]]; then
    printf 'caddy\ncloudflared\n'
  fi
fi
`;

const fakeBackup = String.raw`#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == predeploy ]] || exit 2
[[ "$3" == ghcr.io/*/commandry@sha256:* && "$4" =~ ^[0-9a-f]{40}$ ]] || exit 2
printf 'backup\n' >> "$COMMANDRY_TEST_ROOT/sequence.calls"
[[ ! -f "$COMMANDRY_TEST_ROOT/fail-backup" ]] || exit 21
status=true
[[ ! -f "$COMMANDRY_TEST_ROOT/non-offsite-backup" ]] || status=false
host_recovery=true
[[ ! -f "$COMMANDRY_TEST_ROOT/failed-host-recovery" ]] || host_recovery=false
release_state=current-release
[[ ! -f "$COMMANDRY_TEST_ROOT/var/lib/commandry/pending-first-release" ]] || release_state=pending-first-release
marker_sha=$(sha256sum "$COMMANDRY_TEST_ROOT/var/lib/commandry/$release_state" | awk '{print $1}')
[[ ! -f "$COMMANDRY_TEST_ROOT/bad-marker-receipt" ]] || marker_sha=$(printf '%064d' 9)
database_name=$(awk -F= '$1 == "DB_NAME" { print $2 }' "$COMMANDRY_TEST_ROOT/etc/commandry/backup.env")
[[ ! -f "$COMMANDRY_TEST_ROOT/bad-database-receipt" ]] || database_name=other_database
printf 'SNAPSHOT=%064d\nCOMPLETED_AT=%s\nOFFSITE=%s\nVERIFIED=true\nRESTORE_PASSED=true\nHOST_RECOVERY_DRILL_PASSED=%s\nDUMP_SHA256=%064d\nGLOBALS_SNAPSHOT=%064d\nGLOBALS_SHA256=%064d\nCONFIG_SNAPSHOT=%064d\nCONFIG_SHA256=%064d\nRELEASE_STATE=%s\nRELEASE_MARKER_SHA256=%s\nDB_NAME=%s\n' 0 "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$status" "$host_recovery" 1 2 3 4 5 "$release_state" "$marker_sha" "$database_name" > "$2"
chmod 0600 "$2"
`;

const fakeSmoke = String.raw`#!/usr/bin/env bash
set -euo pipefail
printf 'smoke %s %s\n' "$2" "$3" >> "$COMMANDRY_TEST_ROOT/hook.calls"
[[ ! -f "$COMMANDRY_TEST_ROOT/fail-smoke" ]] || exit 22
smoke_image=$2
[[ ! -f "$COMMANDRY_TEST_ROOT/bad-smoke-receipt" ]] || smoke_image=ghcr.io/example/commandry@sha256:bad
printf '{"kind":"commandry_deployment_smoke","outcome":"passed","environment":"production","imageDigest":"%s","releaseSha":"%s","completedAt":"%s","bootstrapCreated":false,"authenticatedRead":true,"probeSessionRevoked":true,"workerJobId":"11111111-1111-4111-8111-111111111111","workerId":"22222222-2222-4222-8222-222222222222"}\n' \
  "$smoke_image" "$3" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$COMMANDRY_TEST_ROOT/var/lib/commandry/app-smoke.latest.json"
chmod 0600 "$COMMANDRY_TEST_ROOT/var/lib/commandry/app-smoke.latest.json"
`;

function write(path, content, mode = 0o600) {
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
}

function activatePriorRelease(root) {
  const releasePath = join(root, "var/lib/commandry/current-release");
  write(join(root, "volume-created"), priorBootstrapId);
  write(join(root, "cluster-id"), `${priorClusterId}\n`);
  write(
    releasePath,
    `IMAGE=${oldImage}\nREVISION=${"2".repeat(40)}\nVOLUME=commandry-production-postgres\nDB_NAME=commandry\nBOOTSTRAP_ID=${priorBootstrapId}\nCLUSTER_ID=${priorClusterId}\n`,
  );
  return releasePath;
}

function harness(t) {
  const root = mkdtempSync(join(tmpdir(), "commandry-deploy-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    "opt/commandry/deploy",
    "opt/commandry/docker/postgres/initdb",
    "etc/commandry",
    "etc/commandry/cloudflared",
    "var/lib/commandry",
    "usr/local/sbin",
    "bin",
  ]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  for (const path of [
    "etc/commandry",
    "etc/commandry/cloudflared",
    "var/lib/commandry",
  ]) {
    chmodSync(join(root, path), 0o700);
  }
  copyFileSync(
    join(repository, "compose.production.yaml"),
    join(root, "opt/commandry/compose.production.yaml"),
  );
  copyFileSync(
    join(repository, "deploy/Caddyfile"),
    join(root, "opt/commandry/deploy/Caddyfile"),
  );
  copyFileSync(
    join(repository, "deploy/validate-app-smoke-receipt.py"),
    join(root, "opt/commandry/deploy/validate-app-smoke-receipt.py"),
  );
  for (const name of readdirSync(join(repository, "docker/postgres/initdb"))) {
    copyFileSync(
      join(repository, "docker/postgres/initdb", name),
      join(root, "opt/commandry/docker/postgres/initdb", name),
    );
  }
  write(join(root, "bin/docker"), fakeDocker, 0o755);
  write(
    join(root, "etc/commandry/cloudflared/config.yml"),
    "synthetic: true\n",
  );
  write(join(root, "usr/local/sbin/commandry-backup-gate"), fakeBackup, 0o755);
  write(join(root, "usr/local/sbin/commandry-app-smoke"), fakeSmoke, 0o755);
  write(
    join(root, "etc/commandry/approved-release"),
    [
      "TARGET=production",
      `IMAGE=${newImage}`,
      `REVISION=${revision}`,
      "BUILD_TIME=2026-09-27T00:00:00Z",
      "APPROVAL_ID=local-rehearsal-only",
      "APPROVED_BY=test-fixture",
      `EXPIRES_AT=${new Date(Date.now() + 30 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")}`,
      "",
    ].join("\n"),
  );
  write(
    join(root, "etc/commandry/commandry.env"),
    [
      `COMMANDRY_IMAGE=${oldImage}`,
      `RELEASE_SHA=${"2".repeat(40)}`,
      "RELEASE_BUILD_TIME=2026-09-26T00:00:00Z",
      "PRODUCTION_DB_VOLUME_NAME=commandry-production-postgres",
      "DB_NAME=commandry",
      "DATABASE_URL=postgresql://commandry_app:synthetic-secret@postgres:5432/commandry",
      "DATABASE_MIGRATION_URL=postgresql://commandry_migrate:synthetic-secret@postgres:5432/commandry",
      `BETTER_AUTH_SECRET=${secret}`,
      "",
    ].join("\n"),
  );
  write(join(root, "etc/commandry/backup.env"), "DB_NAME=commandry\n");
  return root;
}

function run(root) {
  return spawnSync("bash", [deployScript, "--test-root", root], {
    encoding: "utf8",
    timeout: 15_000,
  });
}

function event(root) {
  const lines = readFileSync(
    join(root, "var/lib/commandry/deployments.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n");
  return JSON.parse(lines.at(-1));
}

test("approved digest deploys through backup, migration, health, smoke, and ingress gates", (t) => {
  const root = harness(t);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const env = readFileSync(join(root, "etc/commandry/commandry.env"), "utf8");
  const calls = readFileSync(join(root, "docker.calls"), "utf8");
  const sequence = readFileSync(join(root, "sequence.calls"), "utf8");
  assert.match(env, new RegExp(`COMMANDRY_IMAGE=${newImage}`));
  assert.match(env, new RegExp(`RELEASE_SHA=${revision}`));
  assert.match(calls, /run --rm --no-deps migrate/);
  assert.match(calls, /exec -T web node -e/);
  assert.doesNotMatch(calls, /stop cloudflared caddy/);
  assert.match(calls, /caddy cloudflared/);
  assert.ok(
    calls.indexOf(
      "ps --status running --services caddy cloudflared web worker",
    ) < calls.indexOf("run --rm --no-deps migrate"),
  );
  assert.ok(
    sequence.indexOf("run --rm --no-deps migrate") <
      sequence.indexOf("\nbackup\n"),
  );
  assert.equal(
    existsSync(join(root, "var/lib/commandry/pending-first-release")),
    false,
  );
  assert.match(
    readFileSync(join(root, "var/lib/commandry/current-release"), "utf8"),
    new RegExp(`IMAGE=${newImage}`),
  );
  assert.match(
    readFileSync(join(root, "var/lib/commandry/current-release"), "utf8"),
    /VOLUME=commandry-production-postgres\nDB_NAME=commandry\nBOOTSTRAP_ID=[0-9a-f]{32}\nCLUSTER_ID=7411111111111111111/,
  );
  assert.equal(event(root).result, "succeeded");
  assert.equal(event(root).mode, "local_rehearsal");
  assert.equal(event(root).approvedBy, "test-fixture");
  assert.equal(event(root).smokeVerified, true);
  assert.equal(event(root).smokeJobId, "11111111-1111-4111-8111-111111111111");
  assert.equal(event(root).ownerBootstrapped, false);
  assert.doesNotMatch(
    result.stdout + result.stderr + calls,
    new RegExp(secret),
  );
});

test("invalid digest is rejected before Docker or environment mutation", (t) => {
  const root = harness(t);
  const approvalPath = join(root, "etc/commandry/approved-release");
  write(
    approvalPath,
    readFileSync(approvalPath, "utf8").replace(newImage, "latest"),
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not an immutable Commandry digest/);
  assert.equal(existsSync(join(root, "docker.calls")), false);
  assert.match(
    readFileSync(join(root, "etc/commandry/commandry.env"), "utf8"),
    /sha256:1111/,
  );
});

test("expired approval is rejected before Docker or environment mutation", (t) => {
  const root = harness(t);
  const approvalPath = join(root, "etc/commandry/approved-release");
  write(
    approvalPath,
    readFileSync(approvalPath, "utf8").replace(
      /EXPIRES_AT=.*/,
      "EXPIRES_AT=2020-01-01T00:00:00Z",
    ),
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /approval is expired/);
  assert.equal(existsSync(join(root, "docker.calls")), false);
});

test("image revision mismatch is rejected before backup and mutation", (t) => {
  const root = harness(t);
  write(join(root, "wrong-revision"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /revision or source provenance/);
  assert.equal(existsSync(join(root, "hook.calls")), false);
  assert.match(
    readFileSync(join(root, "etc/commandry/commandry.env"), "utf8"),
    /sha256:1111/,
  );
});

test("readable secrets and a symlink lock fail before Docker is invoked", (t) => {
  const root = harness(t);
  const envPath = join(root, "etc/commandry/commandry.env");
  chmodSync(envPath, 0o644);
  const permissionResult = run(root);
  assert.notEqual(permissionResult.status, 0);
  assert.match(permissionResult.stderr, /private file is readable/);
  assert.equal(existsSync(join(root, "docker.calls")), false);

  chmodSync(envPath, 0o600);
  symlinkSync(envPath, join(root, "var/lib/commandry/deploy.lock"));
  const lockResult = run(root);
  assert.notEqual(lockResult.status, 0);
  assert.match(lockResult.stderr, /deployment lock is a symlink/);
  assert.match(readFileSync(envPath, "utf8"), new RegExp(secret));
  assert.equal(existsSync(join(root, "docker.calls")), false);
});

test("failed first-release backup retains its cluster without stopping other services", (t) => {
  const root = harness(t);
  write(join(root, "fail-backup"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backup_gate; rollback: first_release_stopped/);
  assert.match(
    readFileSync(join(root, "etc/commandry/commandry.env"), "utf8"),
    /sha256:1111/,
  );
  assert.doesNotMatch(
    readFileSync(join(root, "docker.calls"), "utf8"),
    /stop (cloudflared|web)/,
  );
  assert.equal(event(root).backupSnapshot, "");
  assert.equal(event(root).result, "failed");
  assert.equal(
    existsSync(join(root, "var/lib/commandry/current-release")),
    false,
  );
  assert.match(
    readFileSync(join(root, "var/lib/commandry/pending-first-release"), "utf8"),
    new RegExp(`IMAGE=${newImage}`),
  );
});

test("a failed first release retries only the same approved candidate and volume", (t) => {
  const root = harness(t);
  write(join(root, "fail-backup"), "1");
  const first = run(root);
  assert.notEqual(first.status, 0);
  const pending = join(root, "var/lib/commandry/pending-first-release");
  const originalMarker = readFileSync(pending, "utf8");
  const bootstrapId = readFileSync(join(root, "volume-created"), "utf8").trim();
  assert.match(originalMarker, new RegExp(`BOOTSTRAP_ID=${bootstrapId}`));
  assert.match(originalMarker, /CLUSTER_ID=7411111111111111111/);
  rmSync(join(root, "fail-backup"));

  const second = run(root);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(
    readFileSync(join(root, "volume-created"), "utf8").trim(),
    bootstrapId,
  );
  assert.equal(existsSync(pending), false);
  assert.match(
    readFileSync(join(root, "var/lib/commandry/current-release"), "utf8"),
    new RegExp(`IMAGE=${newImage}`),
  );
  const sequence = readFileSync(join(root, "sequence.calls"), "utf8");
  assert.equal((sequence.match(/run --rm --no-deps migrate/g) ?? []).length, 2);
  assert.equal((sequence.match(/\nbackup\n/g) ?? []).length, 2);
});

test("a pending release refuses a missing volume instead of recreating it", (t) => {
  const root = harness(t);
  write(join(root, "fail-backup"), "1");
  assert.notEqual(run(root).status, 0);
  rmSync(join(root, "fail-backup"));
  rmSync(join(root, "volume-created"));
  const before = readFileSync(join(root, "docker.calls"), "utf8");
  const retry = run(root);
  assert.notEqual(retry.status, 0);
  assert.match(retry.stderr, /pending database volume is missing/);
  const after = readFileSync(join(root, "docker.calls"), "utf8").slice(
    before.length,
  );
  assert.doesNotMatch(after, /volume create|run --rm --no-deps migrate/);
  assert.equal(
    existsSync(join(root, "var/lib/commandry/pending-first-release")),
    true,
  );
});

test("a pending first release refuses a changed database target", (t) => {
  const root = harness(t);
  write(join(root, "fail-backup"), "1");
  assert.notEqual(run(root).status, 0);
  const pending = join(root, "var/lib/commandry/pending-first-release");
  const originalMarker = readFileSync(pending, "utf8");
  const before = readFileSync(join(root, "docker.calls"), "utf8");
  const envPath = join(root, "etc/commandry/commandry.env");
  write(
    envPath,
    readFileSync(envPath, "utf8").replaceAll("commandry\n", "other_database\n"),
  );
  write(join(root, "etc/commandry/backup.env"), "DB_NAME=other_database\n");
  const retry = run(root);
  assert.notEqual(retry.status, 0);
  assert.match(retry.stderr, /pending first release differs/);
  assert.equal(readFileSync(join(root, "docker.calls"), "utf8"), before);
  assert.equal(readFileSync(pending, "utf8"), originalMarker);
});

test("a retained volume with a reinitialized PostgreSQL cluster fails before migration", (t) => {
  const root = harness(t);
  write(join(root, "fail-backup"), "1");
  assert.notEqual(run(root).status, 0);
  rmSync(join(root, "fail-backup"));
  write(join(root, "cluster-id"), "7422222222222222222\n");
  const before = readFileSync(join(root, "docker.calls"), "utf8");
  const retry = run(root);
  assert.notEqual(retry.status, 0);
  assert.match(
    retry.stderr,
    /PostgreSQL cluster was replaced or reinitialized/,
  );
  const after = readFileSync(join(root, "docker.calls"), "utf8").slice(
    before.length,
  );
  assert.doesNotMatch(after, /volume create|run --rm --no-deps migrate/);
  assert.equal(
    existsSync(join(root, "var/lib/commandry/pending-first-release")),
    true,
  );
});

test("first-release Compose validation failure never stops services", (t) => {
  const root = harness(t);
  write(join(root, "fail-command"), "config --quiet");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /compose_validation/);
  const calls = readFileSync(join(root, "docker.calls"), "utf8");
  assert.doesNotMatch(calls, /stop (cloudflared|web)|volume create/);
  assert.equal(
    existsSync(join(root, "var/lib/commandry/pending-first-release")),
    false,
  );
  assert.match(
    readFileSync(join(root, "etc/commandry/commandry.env"), "utf8"),
    new RegExp(`COMMANDRY_IMAGE=${oldImage}`),
  );
});

test("a preexisting unmarked database volume is rejected before migration", (t) => {
  const root = harness(t);
  write(join(root, "volume-created"), "c".repeat(32));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unmarked Commandry database volume/);
  assert.equal(
    existsSync(join(root, "var/lib/commandry/pending-first-release")),
    false,
  );
  assert.doesNotMatch(
    readFileSync(join(root, "docker.calls"), "utf8"),
    /run --rm --no-deps migrate/,
  );
});

test("a first release refuses to migrate while Commandry ingress is running", (t) => {
  const root = harness(t);
  write(join(root, "unexpected-ingress"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /unactivated Commandry service is already running/,
  );
  const sequence = readFileSync(join(root, "sequence.calls"), "utf8");
  assert.doesNotMatch(sequence, /run --rm --no-deps migrate/);
  assert.equal(
    existsSync(join(root, "var/lib/commandry/pending-first-release")),
    false,
  );
  assert.doesNotMatch(sequence, /stop (cloudflared|web)/);
});

test("tampered pending state and mismatched volume identity fail closed", (t) => {
  const root = harness(t);
  write(join(root, "fail-backup"), "1");
  assert.notEqual(run(root).status, 0);
  rmSync(join(root, "fail-backup"));
  const pending = join(root, "var/lib/commandry/pending-first-release");
  const marker = readFileSync(pending, "utf8");
  write(pending, `${marker}EXTRA=unreviewed\n`);
  const tampered = run(root);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /unexpected content/);
  write(pending, marker);
  write(join(root, "volume-created"), "e".repeat(32));
  const wrongVolume = run(root);
  assert.notEqual(wrongVolume.status, 0);
  assert.match(
    wrongVolume.stderr,
    /volume does not match its bootstrap identity/,
  );
  const sequence = readFileSync(join(root, "sequence.calls"), "utf8");
  assert.equal((sequence.match(/run --rm --no-deps migrate/g) ?? []).length, 1);
});

test("a first-release receipt with a forged pending marker digest is rejected", (t) => {
  const root = harness(t);
  write(join(root, "bad-marker-receipt"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /receipt does not match the release state/);
  assert.equal(
    existsSync(join(root, "var/lib/commandry/current-release")),
    false,
  );
  assert.equal(
    existsSync(join(root, "var/lib/commandry/pending-first-release")),
    true,
  );
});

test("an upgrade backs up before stopping ingress or migrating", (t) => {
  const root = harness(t);
  activatePriorRelease(root);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const sequence = readFileSync(join(root, "sequence.calls"), "utf8");
  assert.ok(
    sequence.indexOf("\nbackup\n") < sequence.indexOf("stop cloudflared caddy"),
  );
  assert.ok(
    sequence.indexOf("\nbackup\n") <
      sequence.indexOf("run --rm --no-deps migrate"),
  );
  assert.equal(
    existsSync(join(root, "var/lib/commandry/pending-first-release")),
    false,
  );
  assert.match(
    readFileSync(join(root, "var/lib/commandry/current-release"), "utf8"),
    new RegExp(
      `BOOTSTRAP_ID=${priorBootstrapId}\\nCLUSTER_ID=${priorClusterId}`,
    ),
  );
});

test("an upgrade rejects a database volume edited in the private environment", (t) => {
  const root = harness(t);
  activatePriorRelease(root);
  const envPath = join(root, "etc/commandry/commandry.env");
  write(
    envPath,
    readFileSync(envPath, "utf8").replace(
      "PRODUCTION_DB_VOLUME_NAME=commandry-production-postgres",
      "PRODUCTION_DB_VOLUME_NAME=commandry-other-postgres",
    ),
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active release database identity differs/);
  assert.equal(existsSync(join(root, "docker.calls")), false);
  assert.equal(existsSync(join(root, "sequence.calls")), false);
  assert.match(readFileSync(envPath, "utf8"), /commandry-other-postgres/);
});

test("backup and application database names must match before Docker runs", (t) => {
  for (const changed of [
    "backup",
    "application",
    "migration",
    "production-name",
  ]) {
    const root = harness(t);
    const envPath = join(root, "etc/commandry/commandry.env");
    const backupPath = join(root, "etc/commandry/backup.env");
    if (changed === "backup") {
      write(backupPath, "DB_NAME=other_database\n");
    } else {
      const original = readFileSync(envPath, "utf8");
      const next =
        changed === "production-name"
          ? original.replace("DB_NAME=commandry\n", "DB_NAME=other_database\n")
          : original.replace(
              changed === "application"
                ? "@postgres:5432/commandry\n"
                : "DATABASE_MIGRATION_URL=postgresql://commandry_migrate:synthetic-secret@postgres:5432/commandry",
              changed === "application"
                ? "@postgres:5432/other_database\n"
                : "DATABASE_MIGRATION_URL=postgresql://commandry_migrate:synthetic-secret@postgres:5432/other_database",
            );
      write(envPath, next);
    }
    const result = run(root);
    assert.notEqual(result.status, 0, changed);
    assert.match(result.stderr, /database targets differ or are ambiguous/);
    assert.equal(existsSync(join(root, "docker.calls")), false, changed);
    assert.equal(existsSync(join(root, "sequence.calls")), false, changed);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-secret/);
  }
});

test("an upgrade rejects a coordinated switch to another database in the same cluster", (t) => {
  const root = harness(t);
  activatePriorRelease(root);
  const envPath = join(root, "etc/commandry/commandry.env");
  write(
    envPath,
    readFileSync(envPath, "utf8").replaceAll("commandry\n", "other_database\n"),
  );
  write(join(root, "etc/commandry/backup.env"), "DB_NAME=other_database\n");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active release database identity differs/);
  assert.equal(existsSync(join(root, "docker.calls")), false);
});

test("duplicate and ambiguous database URLs reject before Docker runs", (t) => {
  for (const mutation of [
    (env) =>
      `${env}DATABASE_URL=postgresql://commandry_app:synthetic-secret@postgres:5432/commandry\n`,
    (env) =>
      env.replace(
        "@postgres:5432/commandry\n",
        "@postgres:5432/commandry?dbname=other_database\n",
      ),
    (env) => env.replace("synthetic-secret@postgres", "invalid%ZZ@postgres"),
    (env) =>
      env.replace("@postgres:5432/commandry\n", "@remote:5432/commandry\n"),
  ]) {
    const root = harness(t);
    const envPath = join(root, "etc/commandry/commandry.env");
    write(envPath, mutation(readFileSync(envPath, "utf8")));
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /database targets differ or are ambiguous/);
    assert.equal(existsSync(join(root, "docker.calls")), false);
  }
});

test("Compose colon and export overrides cannot redirect migration after backup", (t) => {
  for (const assignment of [
    (key, value) => `${key}: ${value}`,
    (key, value) => `export ${key}=${value}`,
  ]) {
    const root = harness(t);
    activatePriorRelease(root);
    const envPath = join(root, "etc/commandry/commandry.env");
    const original = readFileSync(envPath, "utf8");
    write(
      envPath,
      `${original}${assignment("DATABASE_URL", "postgresql://commandry_app:synthetic-secret@postgres:5432/other_database")}\n${assignment("DATABASE_MIGRATION_URL", "postgresql://commandry_migrate:synthetic-secret@postgres:5432/other_database")}\n`,
    );
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /database targets differ or are ambiguous/);
    assert.equal(existsSync(join(root, "docker.calls")), false);
    assert.equal(existsSync(join(root, "sequence.calls")), false);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-secret/);
  }
});

test("the production env rejects unsupported assignments, duplicates, and interpolation", (t) => {
  for (const extra of [
    "DB_POOL_MAX: 10\n",
    "export DB_POOL_MAX=10\n",
    "DB_POOL_MAX=5\nDB_POOL_MAX=10\n",
    "MALFORMED LINE\n",
    "BETTER_AUTH_SECRET=${UNSET_SECRET}\n",
    "EXTRA=quoted#value\n",
  ]) {
    const root = harness(t);
    const envPath = join(root, "etc/commandry/commandry.env");
    write(envPath, readFileSync(envPath, "utf8") + extra);
    const result = run(root);
    assert.notEqual(result.status, 0, extra);
    assert.match(result.stderr, /database targets differ or are ambiguous/);
    assert.equal(existsSync(join(root, "docker.calls")), false, extra);
  }
});

test("the documented production env syntax passes deploy preflight", (t) => {
  const root = harness(t);
  const envPath = join(root, "etc/commandry/commandry.env");
  const example = readFileSync(
    join(repository, "deploy/production.env.example"),
    "utf8",
  );
  write(
    envPath,
    example
      .replace(/^COMMANDRY_IMAGE=.*$/m, `COMMANDRY_IMAGE=${oldImage}`)
      .replace(/^RELEASE_SHA=.*$/m, `RELEASE_SHA=${"2".repeat(40)}`)
      .replace(
        /^RELEASE_BUILD_TIME=.*$/m,
        "RELEASE_BUILD_TIME=2026-09-26T00:00:00Z",
      ),
  );
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
});

test("an upgrade rejects a legacy release marker without volume identity", (t) => {
  const root = harness(t);
  const marker = activatePriorRelease(root);
  write(marker, `IMAGE=${oldImage}\nREVISION=${"2".repeat(40)}\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active release lacks database identity/);
  assert.equal(existsSync(join(root, "docker.calls")), false);
});

test("an upgrade rejects a legacy release marker without database name identity", (t) => {
  const root = harness(t);
  const marker = activatePriorRelease(root);
  write(
    marker,
    readFileSync(marker, "utf8").replace("DB_NAME=commandry\n", ""),
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active release lacks database identity/);
  assert.equal(existsSync(join(root, "docker.calls")), false);
});

test("a receipt for another database rejects before upgrade migration", (t) => {
  const root = harness(t);
  activatePriorRelease(root);
  write(join(root, "bad-database-receipt"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /backup receipt does not match the release state/,
  );
  const sequence = readFileSync(join(root, "sequence.calls"), "utf8");
  assert.match(sequence, /\nbackup\n/);
  assert.doesNotMatch(sequence, /run --rm --no-deps migrate/);
});

test("an upgrade rejects a reinitialized cluster before backup or migration", (t) => {
  const root = harness(t);
  const marker = activatePriorRelease(root);
  const originalMarker = readFileSync(marker, "utf8");
  write(join(root, "cluster-id"), "7422222222222222222\n");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active PostgreSQL cluster was replaced/);
  assert.match(result.stderr, /perform operator recovery before retrying/);
  const sequence = readFileSync(join(root, "sequence.calls"), "utf8");
  assert.doesNotMatch(sequence, /\nbackup\n|run --rm --no-deps migrate/);
  assert.match(sequence, /stop cloudflared caddy web worker/);
  assert.doesNotMatch(
    sequence,
    /up --no-deps -d --wait --wait-timeout 120 (web|worker|caddy|cloudflared)/,
  );
  assert.equal(readFileSync(marker, "utf8"), originalMarker);
  assert.equal(
    event(root).rollback,
    "database_identity_unverified_services_stopped",
  );
});

test("an upgrade validation failure preserves the running previous release", (t) => {
  const root = harness(t);
  const marker = activatePriorRelease(root);
  const originalMarker = readFileSync(marker, "utf8");
  write(join(root, "fail-command"), "config --quiet");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /rollback: previous_environment_restored/);
  const calls = readFileSync(join(root, "docker.calls"), "utf8");
  assert.doesNotMatch(
    calls,
    /stop cloudflared|stop caddy|stop web|stop worker/,
  );
  assert.doesNotMatch(calls, /up --no-deps -d --wait --wait-timeout 120/);
  assert.equal(readFileSync(marker, "utf8"), originalMarker);
  assert.equal(event(root).rollback, "previous_environment_restored");
});

test("non-offsite backup receipt fails closed", (t) => {
  const root = harness(t);
  write(join(root, "non-offsite-backup"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verified offsite snapshot/);
  assert.equal(event(root).rollback, "first_release_stopped");
});

test("failed isolated host recovery receipt fails before migration", (t) => {
  const root = harness(t);
  activatePriorRelease(root);
  write(join(root, "failed-host-recovery"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /isolated host recovery/);
  assert.equal(event(root).rollback, "previous_code_restored");
  assert.doesNotMatch(
    readFileSync(join(root, "docker.calls"), "utf8"),
    /run --rm --no-deps migrate/,
  );
});

test("failed smoke after migration restores the prior code image, not the schema", (t) => {
  const root = harness(t);
  activatePriorRelease(root);
  write(join(root, "fail-smoke"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /application_smoke; rollback: previous_code_restored/,
  );
  assert.match(
    readFileSync(join(root, "etc/commandry/commandry.env"), "utf8"),
    /sha256:1111/,
  );
  assert.match(
    readFileSync(join(root, "var/lib/commandry/current-release"), "utf8"),
    /sha256:1111/,
  );
  assert.equal(event(root).rollback, "previous_code_restored");
  assert.equal(event(root).backupSnapshot, "0".repeat(64));
  assert.match(
    readFileSync(join(root, "docker.calls"), "utf8"),
    /up --no-deps -d --wait --wait-timeout 120 caddy cloudflared/,
  );
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("rollback preserves an intentionally stopped ingress", (t) => {
  const root = harness(t);
  activatePriorRelease(root);
  write(join(root, "ingress-was-stopped"), "1");
  write(join(root, "fail-smoke"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  const calls = readFileSync(join(root, "docker.calls"), "utf8");
  assert.match(calls, /stop cloudflared caddy/);
  assert.doesNotMatch(
    calls,
    /up --no-deps -d --wait --wait-timeout 120 caddy cloudflared/,
  );
  assert.equal(event(root).rollback, "previous_code_restored");
});

test("a final audit failure restores the prior image and running ingress", (t) => {
  const root = harness(t);
  const releasePath = activatePriorRelease(root);
  mkdirSync(join(root, "var/lib/commandry/deployments.jsonl"));

  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /complete; rollback: previous_code_restored/);
  assert.match(result.stderr, /deployments\.jsonl: Is a directory/);
  assert.match(
    readFileSync(join(root, "etc/commandry/commandry.env"), "utf8"),
    new RegExp(`COMMANDRY_IMAGE=${oldImage}`),
  );
  assert.match(
    readFileSync(releasePath, "utf8"),
    new RegExp(`IMAGE=${oldImage}`),
  );
  const calls = readFileSync(join(root, "docker.calls"), "utf8");
  assert.equal((calls.match(/stop cloudflared caddy/g) ?? []).length, 2);
  assert.equal(
    (
      calls.match(
        /up --no-deps -d --wait --wait-timeout 120 caddy cloudflared/g,
      ) ?? []
    ).length,
    2,
  );
});

test("a final audit failure restores intentionally stopped ingress", (t) => {
  const root = harness(t);
  const releasePath = activatePriorRelease(root);
  write(join(root, "ingress-was-stopped"), "1");
  mkdirSync(join(root, "var/lib/commandry/deployments.jsonl"));

  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /complete; rollback: previous_code_restored/);
  assert.match(
    readFileSync(releasePath, "utf8"),
    new RegExp(`IMAGE=${oldImage}`),
  );
  const calls = readFileSync(join(root, "docker.calls"), "utf8");
  assert.equal((calls.match(/stop cloudflared caddy/g) ?? []).length, 2);
  assert.equal(
    (
      calls.match(
        /up --no-deps -d --wait --wait-timeout 120 caddy cloudflared/g,
      ) ?? []
    ).length,
    1,
  );
});

test("a final audit failure stops a first release and restores its pending marker", (t) => {
  const root = harness(t);
  mkdirSync(join(root, "var/lib/commandry/deployments.jsonl"));

  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /complete; rollback: first_release_stopped/);
  assert.equal(
    existsSync(join(root, "var/lib/commandry/current-release")),
    false,
  );
  assert.match(
    readFileSync(join(root, "var/lib/commandry/pending-first-release"), "utf8"),
    new RegExp(`IMAGE=${newImage}`),
  );
  assert.match(
    readFileSync(join(root, "etc/commandry/commandry.env"), "utf8"),
    new RegExp(`COMMANDRY_IMAGE=${oldImage}`),
  );
  const calls = readFileSync(join(root, "docker.calls"), "utf8");
  assert.match(calls, /stop cloudflared caddy/);
  assert.match(calls, /stop web worker/);
});

test("a mismatched smoke receipt prevents ingress and rolls back", (t) => {
  const root = harness(t);
  write(join(root, "bad-smoke-receipt"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /application_smoke; rollback: first_release_stopped/,
  );
  assert.equal(event(root).smokeVerified, false);
  assert.doesNotMatch(
    readFileSync(join(root, "docker.calls"), "utf8"),
    /up --no-deps -d --wait --wait-timeout 120 caddy cloudflared/,
  );
});
