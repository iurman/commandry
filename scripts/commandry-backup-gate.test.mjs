import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const secret = "SYNTHETIC_SECRET_DO_NOT_LOG";

test("local rehearsal rejects remote and out-of-scope repositories before any backup", () => {
  for (const repository of [
    `s3:https://${"a".repeat(32)}.r2.cloudflarestorage.com/commandry`,
    "/tmp/commandry-restic",
  ]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/commandry-backup-gate.mjs", "rehearse"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "local",
          DB_NAME: "commandry",
          RESTIC_REPOSITORY: repository,
          RESTIC_PASSWORD_FILE: "/tmp/commandry-password",
          AWS_SECRET_ACCESS_KEY: secret,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).reason, "LOCAL_REHEARSAL_CONFIG");
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
  }
});

function withHostFixture(callback) {
  const fixture = mkdtempSync(resolve(tmpdir(), "commandry-backup-runtime-"));
  const base = resolve(fixture, "opt/commandry");
  const runtime = resolve(base, "runtime");
  mkdirSync(runtime, { recursive: true });
  const scripts = resolve(base, "scripts");
  mkdirSync(scripts);
  for (const name of [
    "commandry-backup-gate.mjs",
    "commandry-scheduled-backup.mjs",
    "host-backup-config.mjs",
    "restic-postgres.mjs",
    "restic-isolated-restore.mjs",
    "r2-repository.mjs",
    "container-runtime.mjs",
    "stream-process.mjs",
  ])
    writeFileSync(resolve(scripts, name), "// trusted test fixture\n", {
      mode: 0o644,
    });
  const node = resolve(runtime, "node");
  const restic = resolve(runtime, "restic");
  writeFileSync(restic, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const receipt = resolve(
    fixture,
    "var/lib/commandry/predeploy-backup.receipt",
  );
  const image = `ghcr.io/example/commandry@sha256:${"a".repeat(64)}`;
  const revision = "b".repeat(40);
  const run = () =>
    spawnSync(
      "bash",
      [
        resolve(root, "deploy/commandry-backup-gate.sh"),
        "--test-root",
        fixture,
        "predeploy",
        receipt,
        image,
        revision,
      ],
      { encoding: "utf8" },
    );
  const runNightly = () =>
    spawnSync(
      "bash",
      [
        resolve(root, "deploy/commandry-backup-gate.sh"),
        "--test-root",
        fixture,
        "nightly",
      ],
      { encoding: "utf8" },
    );
  try {
    callback({
      base,
      runtime,
      scripts,
      node,
      restic,
      receipt,
      image,
      revision,
      run,
      runNightly,
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("host backup gate uses a fixed trusted Node 24 runtime", () => {
  withHostFixture(
    ({ base, node, receipt, image, revision, run, runNightly }) => {
      writeFileSync(
        node,
        `#!/bin/sh\nif [ "$1" = --version ]; then printf 'v24.17.0\\n'; exit 0; fi\nprintf '%s\\n' "$@"\n`,
        { mode: 0o755 },
      );
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.stdout.trim().split("\n"), [
        resolve(base, "scripts/commandry-backup-gate.mjs"),
        "predeploy",
        receipt,
        image,
        revision,
      ]);
      const nightly = runNightly();
      assert.equal(nightly.status, 0, nightly.stderr);
      assert.deepEqual(nightly.stdout.trim().split("\n"), [
        resolve(base, "scripts/commandry-scheduled-backup.mjs"),
        "nightly",
      ]);
    },
  );
});

test("host backup gate rejects missing, writable, symlinked, and wrong-version runtimes", () => {
  withHostFixture(({ node, restic, run }) => {
    assert.match(run().stderr, /needs root-owned source and runtime files/);
    writeFileSync(node, "#!/bin/sh\nprintf 'v22.0.0\\n'\n", { mode: 0o755 });
    assert.match(run().stderr, /requires Node.js 24/);
    writeFileSync(node, "#!/bin/sh\nprintf 'v24.17.0\\n'\n", { mode: 0o755 });
    chmodSync(node, 0o777);
    assert.match(run().stderr, /writable controlled path/);
    rmSync(node);
    symlinkSync(process.execPath, node);
    assert.match(run().stderr, /untrusted controlled path/);
    rmSync(node);
    writeFileSync(node, "#!/bin/sh\nprintf 'v24.17.0\\n'\n", { mode: 0o755 });
    rmSync(restic);
    assert.match(run().stderr, /needs root-owned source and runtime files/);
  });
});

test("host backup gate rejects a writable imported source before starting Node", () => {
  withHostFixture(({ scripts, node, runNightly }) => {
    writeFileSync(node, "#!/bin/sh\nprintf 'v24.17.0\\n'\n", { mode: 0o755 });
    chmodSync(resolve(scripts, "host-backup-config.mjs"), 0o666);
    assert.match(runNightly().stderr, /writable controlled path/);
  });
});
