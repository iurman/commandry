import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve(import.meta.dirname, "../deploy/commandry-app-smoke.sh");
const image = `ghcr.io/example/commandry@sha256:${"a".repeat(64)}`;
const revision = "b".repeat(40);
const password = "SYNTHETIC_OWNER_PASSWORD_1234";
const fakeDocker = String.raw`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$COMMANDRY_TEST_ROOT/docker.calls"
case " $* " in
  *' config --quiet '*)
    [[ ! -f "$COMMANDRY_TEST_ROOT/fail-config" ]] || exit 19
    ;;
  *' run --rm --no-deps -T worker node apps/worker/dist/deployment-smoke.js '*)
    read -r owner
    read -r secret
    [[ "$owner" == owner@commandry.test && "$secret" == SYNTHETIC_OWNER_PASSWORD_1234 ]] || exit 21
    [[ ! -f "$COMMANDRY_TEST_ROOT/fail-smoke" ]] || exit 23
    if [[ -f "$COMMANDRY_TEST_ROOT/bad-receipt" ]]; then printf 'not-json\n'; exit 0; fi
    stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    [[ ! -f "$COMMANDRY_TEST_ROOT/stale-receipt" ]] || stamp=2020-01-01T00:00:00Z
    while [[ $# -gt 2 ]]; do shift; done
    image_arg=$1
    revision_arg=$2
    printf '{"kind":"commandry_deployment_smoke","outcome":"passed","environment":"production","imageDigest":"%s","releaseSha":"%s","completedAt":"%s","bootstrapCreated":true,"authenticatedRead":true,"probeSessionRevoked":true,"workerJobId":"11111111-1111-4111-8111-111111111111","workerId":"22222222-2222-4222-8222-222222222222"}\n' \
      "$image_arg" "$revision_arg" "$stamp"
    ;;
esac
`;

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "commandry-app-smoke-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    "opt/commandry",
    "opt/commandry/deploy",
    "etc/commandry",
    "var/lib/commandry",
    "bin",
  ]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  chmodSync(join(root, "etc/commandry"), 0o700);
  chmodSync(join(root, "var/lib/commandry"), 0o700);
  writeFileSync(
    join(root, "opt/commandry/compose.production.yaml"),
    "name: commandry\n",
  );
  copyFileSync(
    resolve(import.meta.dirname, "../deploy/validate-app-smoke-receipt.py"),
    join(root, "opt/commandry/deploy/validate-app-smoke-receipt.py"),
  );
  writeFileSync(
    join(root, "etc/commandry/commandry.env"),
    "APP_ENV=production\n",
    {
      mode: 0o600,
    },
  );
  writeFileSync(join(root, "bin/docker"), fakeDocker, { mode: 0o755 });
  return root;
}

function run(root, expectedImage = image) {
  const envFile = join(root, "etc/commandry/commandry.env");
  const result = spawnSync(
    "bash",
    [script, "--test-root", root, envFile, expectedImage, revision],
    {
      input: `owner@commandry.test\n${password}\n`,
      encoding: "utf8",
    },
  );
  const callsPath = join(root, "docker.calls");
  const calls = existsSync(callsPath) ? readFileSync(callsPath, "utf8") : "";
  const receipt = join(root, "var/lib/commandry/app-smoke.latest.json");
  assert.ok(!`${result.stdout}${result.stderr}${calls}`.includes(password));
  return { result, calls, receipt };
}

test("application smoke writes a private exact-release receipt", (t) => {
  const root = setup(t);
  const { result, calls, receipt } = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(calls, /config --quiet/);
  assert.match(calls, /deployment-smoke\.js/);
  const evidence = JSON.parse(readFileSync(receipt, "utf8"));
  assert.equal(evidence.imageDigest, image);
  assert.equal(evidence.releaseSha, revision);
  assert.equal(statSync(receipt).mode & 0o777, 0o600);
  assert.ok(!readFileSync(receipt, "utf8").includes(password));
});

test("application smoke fails closed when the worker command fails", (t) => {
  const root = setup(t);
  writeFileSync(join(root, "fail-smoke"), "");
  const { result, receipt } = run(root);
  assert.equal(result.status, 1);
  assert.equal(existsSync(receipt), false);
});

test("application smoke rejects malformed proof", (t) => {
  const root = setup(t);
  writeFileSync(join(root, "bad-receipt"), "");
  const { result, receipt } = run(root);
  assert.equal(result.status, 1);
  assert.equal(existsSync(receipt), false);
});

test("application smoke rejects stale proof", (t) => {
  const root = setup(t);
  writeFileSync(join(root, "stale-receipt"), "");
  const { result, receipt } = run(root);
  assert.equal(result.status, 1);
  assert.equal(existsSync(receipt), false);
});

test("application smoke rejects a mutable image and exposed configuration", (t) => {
  const root = setup(t);
  assert.equal(run(root, "ghcr.io/example/commandry:latest").result.status, 1);
  chmodSync(join(root, "etc/commandry/commandry.env"), 0o644);
  assert.equal(run(root).result.status, 1);
});
