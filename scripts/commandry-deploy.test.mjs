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

const fakeDocker = String.raw`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$COMMANDRY_TEST_ROOT/docker.calls"
if [[ -f "$COMMANDRY_TEST_ROOT/fail-command" ]]; then
  pattern=$(cat "$COMMANDRY_TEST_ROOT/fail-command")
  [[ "$*" != *"$pattern"* ]] || exit 29
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
if [[ "$*" == *'ps --status running --services caddy cloudflared'* && \
  ! -f "$COMMANDRY_TEST_ROOT/ingress-was-stopped" ]]; then
  printf 'caddy\ncloudflared\n'
fi
`;

const fakeBackup = String.raw`#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == predeploy ]] || exit 2
[[ "$3" == ghcr.io/*/commandry@sha256:* && "$4" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ ! -f "$COMMANDRY_TEST_ROOT/fail-backup" ]] || exit 21
status=true
[[ ! -f "$COMMANDRY_TEST_ROOT/non-offsite-backup" ]] || status=false
printf 'SNAPSHOT=%064d\nCOMPLETED_AT=%s\nOFFSITE=%s\nVERIFIED=true\nRESTORE_PASSED=true\nDUMP_SHA256=%064d\nGLOBALS_SNAPSHOT=%064d\nGLOBALS_SHA256=%064d\nCONFIG_SNAPSHOT=%064d\nCONFIG_SHA256=%064d\n' 0 "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$status" 1 2 3 4 5 > "$2"
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
      `BETTER_AUTH_SECRET=${secret}`,
      "",
    ].join("\n"),
  );
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
  assert.match(env, new RegExp(`COMMANDRY_IMAGE=${newImage}`));
  assert.match(env, new RegExp(`RELEASE_SHA=${revision}`));
  assert.match(calls, /run --rm --no-deps migrate/);
  assert.match(calls, /exec -T web node -e/);
  assert.match(calls, /stop cloudflared caddy/);
  assert.match(calls, /caddy cloudflared/);
  assert.ok(
    calls.indexOf("stop cloudflared caddy") <
      calls.indexOf("run --rm --no-deps migrate"),
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

test("failed backup stops a first release and restores the previous environment", (t) => {
  const root = harness(t);
  write(join(root, "fail-backup"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backup_gate; rollback: first_release_stopped/);
  assert.match(
    readFileSync(join(root, "etc/commandry/commandry.env"), "utf8"),
    /sha256:1111/,
  );
  assert.match(
    readFileSync(join(root, "docker.calls"), "utf8"),
    /stop cloudflared caddy web worker/,
  );
  assert.equal(event(root).backupSnapshot, "");
  assert.equal(event(root).result, "failed");
});

test("non-offsite backup receipt fails closed", (t) => {
  const root = harness(t);
  write(join(root, "non-offsite-backup"), "1");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verified offsite snapshot/);
  assert.equal(event(root).rollback, "first_release_stopped");
});

test("failed smoke after migration restores the prior code image, not the schema", (t) => {
  const root = harness(t);
  write(
    join(root, "var/lib/commandry/current-release"),
    `IMAGE=${oldImage}\nREVISION=${"2".repeat(40)}\n`,
  );
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
  write(
    join(root, "var/lib/commandry/current-release"),
    `IMAGE=${oldImage}\nREVISION=${"2".repeat(40)}\n`,
  );
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
