import assert from "node:assert/strict";
import test from "node:test";
import { parseR2Repository } from "./r2-repository.mjs";

const account = "a".repeat(32);

test("accepts only canonical Cloudflare R2 S3 repositories", () => {
  assert.deepEqual(
    parseR2Repository(
      `s3:https://${account}.r2.cloudflarestorage.com/commandry-backups/production`,
    ),
    {
      accountId: account,
      jurisdiction: null,
      bucket: "commandry-backups",
      prefix: "production",
    },
  );
  assert.equal(
    parseR2Repository(`s3:https://${account}.eu.r2.cloudflarestorage.com/abc`)
      ?.jurisdiction,
    "eu",
  );
  for (const value of [
    "/tmp/local-restic",
    `s3:http://${account}.r2.cloudflarestorage.com/abc`,
    `s3:https://bucket.${account}.r2.cloudflarestorage.com/abc`,
    `s3:https://${account}.r2.cloudflarestorage.com/abc/../escape`,
    `s3:https://${account}.r2.cloudflarestorage.com/abc?x=1`,
    `s3:https://${account}.r2.cloudflarestorage.com/abc//double`,
    `s3:https://${account}.r2.cloudflarestorage.com/ab`,
    `s3:https://${account}.r2.cloudflarestorage.com/abc@other`,
  ]) {
    assert.equal(parseR2Repository(value), null, value);
  }
});
