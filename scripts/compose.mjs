import { existsSync } from "node:fs";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";
import {
  getLocalSourceState,
  imageLabelsMatchSource,
  localComposeSourceVariables,
  runtimeWithLocalSource,
} from "./local-source-provenance.mjs";

const action = process.argv[2];
if (action !== "up" && action !== "down") {
  console.error("Usage: node scripts/compose.mjs up|down");
  process.exit(2);
}

if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run `pnpm setup` first.");
  process.exit(1);
}

const runtime = detectContainerRuntime();
if (!runtime) {
  console.error(
    "A Docker-compatible Compose runtime is unavailable. On Bazzite, install a host Compose provider for Podman; in Toolbx, ensure flatpak-spawn can reach the host CLI.",
  );
  process.exit(1);
}

const args = ["compose", "--env-file", ".env.local", "-f", "compose.yaml"];
let source = null;
try {
  if (action === "up") source = getLocalSourceState();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Git source is unavailable",
  );
  process.exit(1);
}
const overrides = source ? localComposeSourceVariables(source) : {};
const hostRuntime = source
  ? runtimeWithLocalSource(runtime, overrides)
  : runtime;
const hostEnvironment = { ...process.env, ...overrides };

function runCompose(operation) {
  const result = runContainer(hostRuntime, [...args, ...operation], {
    stdio: "inherit",
    env: hostEnvironment,
  });
  if (result.error) console.error(`Compose failed: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function imageMatchesCleanSource() {
  if (!source?.clean) return false;
  const result = runContainer(
    hostRuntime,
    [
      "image",
      "inspect",
      `commandry-local:${source.revision}`,
      "--format",
      "{{json .Config.Labels}}",
    ],
    { encoding: "utf8", timeout: 15_000 },
  );
  if (result.error || result.status !== 0) return false;
  try {
    return imageLabelsMatchSource(JSON.parse(result.stdout), source);
  } catch {
    return false;
  }
}

function requireUnchangedCleanSource() {
  const current = getLocalSourceState();
  if (!current.clean || current.revision !== source?.revision) {
    console.error("The committed source changed during the Compose build.");
    process.exit(1);
  }
}

if (action === "down") {
  runCompose(["down"]);
} else if (source?.clean) {
  runCompose(["build", "web"]);
  requireUnchangedCleanSource();
  if (!imageMatchesCleanSource()) {
    console.error(
      "The cached image has different source labels. Rebuilding the shared local image without cache.",
    );
    runCompose(["build", "--no-cache", "web"]);
    requireUnchangedCleanSource();
    if (!imageMatchesCleanSource()) {
      console.error("The rebuilt image still lacks clean source labels.");
      process.exit(1);
    }
  }
  runCompose(["up", "--no-build", "-d", "--wait"]);
} else {
  runCompose(["up", "--build", "-d", "--wait"]);
}
