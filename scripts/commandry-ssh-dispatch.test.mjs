import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const dispatcher = resolve(root, "deploy/commandry-ssh-dispatch.sh");

function withFixture(callback) {
  const fixture = mkdtempSync(resolve(tmpdir(), "commandry-ssh-dispatch-"));
  const sudo = resolve(fixture, "usr/bin/sudo");
  const deploy = resolve(fixture, "usr/local/sbin/commandry-deploy");
  mkdirSync(resolve(fixture, "usr/bin"), { recursive: true });
  mkdirSync(resolve(fixture, "usr/local/sbin"), { recursive: true });
  writeFileSync(
    sudo,
    '#!/bin/sh\nprintf "%s|%s|%s|%s\\n" "$1" "$2" "$HOME" "${COMMANDRY_TEST_SECRET-unset}"\n',
    { mode: 0o755 },
  );
  writeFileSync(deploy, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (overrides = {}, args = ["--test-root", fixture]) =>
    spawnSync("bash", [dispatcher, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        COMMANDRY_TEST_SECRET: "must-not-pass",
        ...overrides,
      },
    });
  try {
    callback({ fixture, run, sudo, deploy });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("forced SSH dispatcher invokes only the no-argument sudo rule with a clean environment", () => {
  withFixture(({ fixture, run }) => {
    const result = run({ SSH_ORIGINAL_COMMAND: "", SSH_TTY: "" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      `-n|${resolve(fixture, "usr/local/sbin/commandry-deploy")}|/nonexistent|unset`,
    );
  });
});

test("forced SSH dispatcher rejects requested commands, TTYs, and arguments", () => {
  withFixture(({ fixture, run }) => {
    for (const environment of [
      { SSH_ORIGINAL_COMMAND: "sh", SSH_TTY: "" },
      { SSH_ORIGINAL_COMMAND: "sudo -i", SSH_TTY: "" },
      { SSH_ORIGINAL_COMMAND: "", SSH_TTY: "/dev/pts/3" },
    ]) {
      const result = run(environment);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /rejected a requested command or TTY/);
    }
    const extra = run({ SSH_ORIGINAL_COMMAND: "", SSH_TTY: "" }, [
      "--test-root",
      fixture,
      "shell",
    ]);
    assert.equal(extra.status, 1);
    assert.equal(extra.stdout, "");
  });
});

test("forced SSH dispatcher rejects a missing controlled command", () => {
  withFixture(({ run, sudo }) => {
    rmSync(sudo);
    const result = run({ SSH_ORIGINAL_COMMAND: "", SSH_TTY: "" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /needs the controlled deploy command/);
  });
});
