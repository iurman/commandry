import assert from "node:assert/strict";
import { test } from "node:test";
import { openLocalBackup, sealLocalBackup } from "./local-backup-crypto.mjs";

test("local backup envelope encrypts exact data and rejects tampering or a wrong key", () => {
  const secret = "test-key-".repeat(8);
  const original = Buffer.from("Original capture\nprivate local data\n");
  const archive = sealLocalBackup(original, secret);
  assert.deepEqual(openLocalBackup(archive, secret), original);
  assert.equal(archive.includes(original), false);
  assert.notDeepEqual(sealLocalBackup(original, secret), archive);
  assert.throws(
    () => openLocalBackup(archive, "another-test-key-".repeat(8)),
    /integrity verification/,
  );
  const tampered = Buffer.from(archive);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(
    () => openLocalBackup(tampered, secret),
    /integrity verification/,
  );
  assert.throws(
    () => openLocalBackup(archive.subarray(0, 32), secret),
    /integrity verification/,
  );
});
