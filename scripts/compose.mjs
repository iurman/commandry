import { existsSync } from "node:fs";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";
import {
  getLocalSourceState,
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
args.push(...(action === "up" ? ["up", "--build", "-d", "--wait"] : ["down"]));
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
const result = runContainer(hostRuntime, args, {
  stdio: "inherit",
  env: { ...process.env, ...overrides },
});
if (result.error) console.error(`Compose failed: ${result.error.message}`);
process.exit(result.status ?? 1);
