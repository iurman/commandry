import { existsSync } from "node:fs";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";

if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run pnpm setup first.");
  process.exit(1);
}
if (process.stdin.isTTY) {
  console.error(
    "Pipe the owner email and new password through standard input.",
  );
  process.exit(1);
}
const runtime = detectContainerRuntime();
if (!runtime) {
  console.error("A Docker-compatible Compose runtime is unavailable.");
  process.exit(1);
}

const compose = ["compose", "--env-file", ".env.local", "-f", "compose.yaml"];
const running = runContainer(
  runtime,
  [...compose, "ps", "--status", "running", "--services", "web"],
  { encoding: "utf8" },
);
if (running.error || running.status !== 0) {
  console.error("Could not inspect the local web service.");
  process.exit(1);
}

const webWasRunning = running.stdout.split(/\r?\n/).includes("web");
let webStopped = false;
let resultCode = 1;
try {
  if (webWasRunning) {
    webStopped = true;
    const stopped = runContainer(runtime, [...compose, "stop", "web"], {
      stdio: "inherit",
    });
    if (stopped.error || stopped.status !== 0) {
      throw new Error("Could not stop local web before owner recovery.");
    }
  }
  const recovered = runContainer(
    runtime,
    [
      ...compose,
      "run",
      "--rm",
      "--no-deps",
      "-T",
      "worker",
      "node",
      "apps/worker/dist/recover-local-auth.js",
    ],
    { stdio: "inherit" },
  );
  if (recovered.error) throw recovered.error;
  resultCode = recovered.status ?? 1;
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Local recovery failed.",
  );
} finally {
  if (webStopped) {
    const restarted = runContainer(
      runtime,
      [...compose, "up", "-d", "--no-deps", "--wait", "web"],
      { stdio: "inherit" },
    );
    if (restarted.error || restarted.status !== 0) {
      console.error("Could not restart local web after owner recovery.");
      resultCode = 1;
    }
  }
}
process.exit(resultCode);
