import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
