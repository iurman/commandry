import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve(
  import.meta.dirname,
  "../deploy/commandry-owner-recover.sh",
);
const password = "SYNTHETIC_RECOVERY_PASSWORD_1234";
const fakeDocker = String.raw`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$COMMANDRY_TEST_ROOT/docker.calls"
case " $* " in
  *' ps --status running --services web '*)
    if [[ ! -f "$COMMANDRY_TEST_ROOT/web-stopped" ]]; then printf 'web\n'; fi
    ;;
  *' stop web '*)
    [[ ! -f "$COMMANDRY_TEST_ROOT/fail-stop" ]] || exit 17
    ;;
  *' run --rm --no-deps -T worker node apps/worker/dist/recover-local-auth.js '*)
    read -r owner
    read -r secret
    [[ "$owner" == owner@commandry.test && "$secret" == SYNTHETIC_RECOVERY_PASSWORD_1234 ]] || exit 19
    [[ ! -f "$COMMANDRY_TEST_ROOT/fail-recovery" ]] || exit 23
    printf '{"operation":"auth.owner_password_recovered","revokedSessionCount":1}\n'
    ;;
  *' up -d --no-deps --wait --wait-timeout 120 web '*)
    [[ ! -f "$COMMANDRY_TEST_ROOT/fail-restart" ]] || exit 29
    ;;
esac
`;

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "commandry-owner-recovery-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    "opt/commandry",
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

function run(root, input = `owner@commandry.test\n${password}\n`) {
  const result = spawnSync("bash", [script, "--test-root", root], {
    input,
    encoding: "utf8",
  });
  const calls = readFileSync(join(root, "docker.calls"), "utf8")
    .trim()
    .split("\n");
  assert.ok(
    !`${result.stdout}${result.stderr}${calls.join(" ")}`.includes(password),
  );
  return { result, calls };
}

test("production owner recovery stops web, resets the owner, and restarts web", (t) => {
  const root = setup(t);
  const { result, calls } = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.length, 5);
  assert.match(calls[1], / ps --status running --services web$/);
  assert.match(calls[2], / stop web$/);
  assert.match(
    calls[3],
    / run --rm --no-deps -T worker node apps\/worker\/dist\/recover-local-auth\.js$/,
  );
  assert.match(calls[4], / up -d --no-deps --wait --wait-timeout 120 web$/);
  assert.match(result.stdout, /revokedSessionCount/);
});

test("production owner recovery restarts web after a failed reset", (t) => {
  const root = setup(t);
  writeFileSync(join(root, "fail-recovery"), "");
  const { result, calls } = run(root);
  assert.equal(result.status, 23);
  assert.match(calls.at(-1), / up -d --no-deps --wait --wait-timeout 120 web$/);
});

test("production owner recovery attempts restart after a failed stop", (t) => {
  const root = setup(t);
  writeFileSync(join(root, "fail-stop"), "");
  const { result, calls } = run(root);
  assert.equal(result.status, 1);
  assert.equal(calls.length, 4);
  assert.match(calls.at(-1), / up -d --no-deps --wait --wait-timeout 120 web$/);
});

test("production owner recovery leaves an already stopped web service stopped", (t) => {
  const root = setup(t);
  writeFileSync(join(root, "web-stopped"), "");
  const { result, calls } = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.length, 3);
  assert.match(
    calls.at(-1),
    / run --rm --no-deps -T worker node apps\/worker\/dist\/recover-local-auth\.js$/,
  );
});

test("production owner recovery rejects an exposed environment file", (t) => {
  const root = setup(t);
  chmodSync(join(root, "etc/commandry/commandry.env"), 0o644);
  const result = spawnSync("bash", [script, "--test-root", root], {
    input: `owner@commandry.test\n${password}\n`,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private path/);
});
