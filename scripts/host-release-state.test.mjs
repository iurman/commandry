import assert from "node:assert/strict";
import test from "node:test";
import { parseCurrentRelease } from "./host-backup-config.mjs";

const image = `ghcr.io/example/commandry@sha256:${"a".repeat(64)}`;
const revision = "b".repeat(40);
const marker = `IMAGE=${image}\nREVISION=${revision}\nVOLUME=commandry-production-postgres\nDB_NAME=commandry\nBOOTSTRAP_ID=${"c".repeat(32)}\nCLUSTER_ID=7411111111111111111\n`;
const environment = `COMMANDRY_IMAGE=${image}\nRELEASE_SHA=${revision}\nPRODUCTION_DB_VOLUME_NAME=commandry-production-postgres\nDB_NAME=commandry\n`;

test("monthly restore accepts the complete deployed release identity", () => {
  assert.deepEqual(parseCurrentRelease(marker, environment), {
    image,
    revision,
  });
});

test("monthly restore rejects the legacy marker without database identity", () => {
  assert.throws(
    () =>
      parseCurrentRelease(
        `IMAGE=${image}\nREVISION=${revision}\n`,
        environment,
      ),
    /CURRENT_RELEASE/,
  );
});

for (const key of [
  "COMMANDRY_IMAGE",
  "RELEASE_SHA",
  "PRODUCTION_DB_VOLUME_NAME",
  "DB_NAME",
]) {
  test(`monthly restore rejects mismatched or duplicate ${key}`, () => {
    const changed = environment.replace(
      new RegExp(`^${key}=.+$`, "m"),
      `${key}=different`,
    );
    assert.throws(
      () => parseCurrentRelease(marker, changed),
      /CURRENT_RELEASE/,
    );
    assert.throws(
      () =>
        parseCurrentRelease(
          marker,
          environment +
            environment.split("\n").find((line) => line.startsWith(`${key}=`)) +
            "\n",
        ),
      /CURRENT_RELEASE/,
    );
  });
}

test("monthly restore rejects malformed and extra identity fields", () => {
  for (const changed of [
    marker.replace(/BOOTSTRAP_ID=.+/, "BOOTSTRAP_ID=invalid"),
    marker.replace(/CLUSTER_ID=.+/, "CLUSTER_ID=0"),
    marker + "EXTRA=true\n",
  ]) {
    assert.throws(
      () => parseCurrentRelease(changed, environment),
      /CURRENT_RELEASE/,
    );
  }
});
