import { existsSync } from "node:fs";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";

if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run pnpm setup first.");
  process.exit(1);
}
const runtime = detectContainerRuntime();
if (!runtime) {
  console.error("A Docker-compatible Compose runtime is unavailable.");
  process.exit(1);
}
const result = runContainer(
  runtime,
  [
    "compose",
    "--env-file",
    ".env.local",
    "-f",
    "compose.yaml",
    "run",
    "--rm",
    "--no-deps",
    "-T",
    "worker",
    "node",
    "apps/worker/dist/bootstrap-local-auth.js",
  ],
  { stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
