import { spawnSync } from "node:child_process";

export function parseGitSourceState(revisionResult, statusResult) {
  if (
    revisionResult.error ||
    revisionResult.status !== 0 ||
    statusResult.error ||
    statusResult.status !== 0
  ) {
    throw new Error("Cannot determine the local Git source state");
  }
  const revision = revisionResult.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("Local Git revision is not a commit SHA");
  }
  return { revision, clean: statusResult.stdout.trim().length === 0 };
}

export function getLocalSourceState(cwd = process.cwd()) {
  const options = { cwd, encoding: "utf8", timeout: 5_000 };
  return parseGitSourceState(
    spawnSync("git", ["rev-parse", "--verify", "HEAD"], options),
    spawnSync(
      "git",
      ["status", "--porcelain", "--untracked-files=normal"],
      options,
    ),
  );
}

export function localComposeSourceVariables(source) {
  return {
    COMMANDRY_SOURCE_REVISION: source.revision,
    COMMANDRY_SOURCE_CLEAN: String(source.clean),
    RELEASE_SHA: source.clean ? source.revision : "local-dirty",
  };
}

export function imageLabelsMatchSource(labels, source) {
  return (
    labels !== null &&
    typeof labels === "object" &&
    labels["org.opencontainers.image.revision"] === source.revision &&
    labels["org.commandry.source.clean"] === "true" &&
    source.clean
  );
}

export function runtimeWithLocalSource(runtime, variables) {
  if (runtime.command !== "flatpak-spawn") return runtime;
  return {
    ...runtime,
    prefix: [
      ...runtime.prefix.slice(0, -1),
      ...Object.entries(variables).map(
        ([key, value]) => `--env=${key}=${value}`,
      ),
      runtime.prefix.at(-1),
    ],
  };
}
