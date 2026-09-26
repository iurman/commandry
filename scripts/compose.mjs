import { existsSync } from "node:fs";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";

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
const result = runContainer(runtime, args, { stdio: "inherit" });
if (result.error) console.error(`Compose failed: ${result.error.message}`);
process.exit(result.status ?? 1);
