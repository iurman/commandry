import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const recoveryScript = resolve(
  fileURLToPath(new URL("recover-local-auth.mjs", import.meta.url)),
);
const fakeDocker = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.COMMANDRY_TEST_CALLS, args.join(" ") + "\\n");
if (args[0] === "compose" && args[1] === "version") process.exit(0);
if (args.includes("ps")) {
  if (process.env.COMMANDRY_TEST_WEB_RUNNING === "true") process.stdout.write("web\\n");
  process.exit(0);
}
if (args.includes("stop")) process.exit(Number(process.env.COMMANDRY_TEST_STOP_EXIT));
if (args.includes("run")) process.exit(Number(process.env.COMMANDRY_TEST_RECOVERY_EXIT));
process.exit(0);
`;

async function runRecovery({ webRunning, recoveryExit, stopExit = 0 }) {
  const directory = await mkdtemp(join(tmpdir(), "commandry-auth-wrapper-"));
  const callsPath = join(directory, "calls.log");
  const dockerPath = join(directory, "docker");
  const password = "Fixture-Owner-Password-1234";
  try {
    await writeFile(join(directory, ".env.local"), "APP_ENV=local\n");
    await writeFile(dockerPath, fakeDocker, { mode: 0o755 });
    const result = spawnSync(process.execPath, [recoveryScript], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
        COMMANDRY_TEST_CALLS: callsPath,
        COMMANDRY_TEST_WEB_RUNNING: String(webRunning),
        COMMANDRY_TEST_RECOVERY_EXIT: String(recoveryExit),
        COMMANDRY_TEST_STOP_EXIT: String(stopExit),
      },
      input: `owner@commandry.test\n${password}\n`,
      encoding: "utf8",
    });
    const calls = (await readFile(callsPath, "utf8")).trim().split("\n");
    assert.ok(
      !`${result.stdout}${result.stderr}${calls.join(" ")}`.includes(password),
    );
    return { result, calls };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("local owner recovery stops and restores a running web service", async () => {
  const { result, calls } = await runRecovery({
    webRunning: true,
    recoveryExit: 0,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.length, 5);
  assert.match(calls[1], / ps --status running --services web$/);
  assert.match(calls[2], / stop web$/);
  assert.match(
    calls[3],
    / run --rm --no-deps -T worker node apps\/worker\/dist\/recover-local-auth\.js$/,
  );
  assert.match(calls[4], / up -d --no-deps --wait web$/);
});

test("local owner recovery restores web after a failed reset", async () => {
  const { result, calls } = await runRecovery({
    webRunning: true,
    recoveryExit: 7,
  });
  assert.equal(result.status, 7);
  assert.match(calls.at(-1), / up -d --no-deps --wait web$/);
});

test("local owner recovery attempts to restore web after a failed stop", async () => {
  const { result, calls } = await runRecovery({
    webRunning: true,
    recoveryExit: 0,
    stopExit: 7,
  });
  assert.equal(result.status, 1);
  assert.equal(calls.length, 4);
  assert.match(calls[2], / stop web$/);
  assert.match(calls[3], / up -d --no-deps --wait web$/);
});

test("local owner recovery leaves an already stopped web service stopped", async () => {
  const { result, calls } = await runRecovery({
    webRunning: false,
    recoveryExit: 0,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.length, 3);
  assert.match(
    calls[2],
    / run --rm --no-deps -T worker node apps\/worker\/dist\/recover-local-auth\.js$/,
  );
});
