import assert from "node:assert/strict";
import { test } from "node:test";
import {
  localComposeSourceVariables,
  parseGitSourceState,
  runtimeWithLocalSource,
} from "./local-source-provenance.mjs";

const revision = "a".repeat(40);

test("a clean Git checkout has a verifiable source revision", () => {
  assert.deepEqual(
    parseGitSourceState(
      { status: 0, stdout: `${revision}\n` },
      { status: 0, stdout: "" },
    ),
    { revision, clean: true },
  );
});

test("tracked and untracked changes mark a local build as dirty", () => {
  assert.deepEqual(
    parseGitSourceState(
      { status: 0, stdout: revision },
      { status: 0, stdout: " M packages/ui/src/index.ts\n?? draft.txt" },
    ),
    { revision, clean: false },
  );
});

test("missing Git evidence cannot label an image as committed", () => {
  assert.throws(
    () =>
      parseGitSourceState(
        { status: 0, stdout: "local" },
        { status: 0, stdout: "" },
      ),
    /not a commit SHA/,
  );
  assert.throws(
    () =>
      parseGitSourceState(
        { status: 128, stdout: "" },
        { status: 0, stdout: "" },
      ),
    /Cannot determine/,
  );
});

test("local Compose forwards only source labels to host Podman", () => {
  const variables = localComposeSourceVariables({ revision, clean: false });
  assert.deepEqual(variables, {
    COMMANDRY_SOURCE_REVISION: revision,
    COMMANDRY_SOURCE_CLEAN: "false",
    RELEASE_SHA: "local-dirty",
  });
  assert.deepEqual(
    runtimeWithLocalSource(
      { command: "flatpak-spawn", prefix: ["--host", "/usr/bin/docker"] },
      variables,
    ).prefix,
    [
      "--host",
      `--env=COMMANDRY_SOURCE_REVISION=${revision}`,
      "--env=COMMANDRY_SOURCE_CLEAN=false",
      "--env=RELEASE_SHA=local-dirty",
      "/usr/bin/docker",
    ],
  );
  assert.deepEqual(
    runtimeWithLocalSource({ command: "docker", prefix: [] }, variables),
    { command: "docker", prefix: [] },
  );
});
