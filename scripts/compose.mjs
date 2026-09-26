import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const action = process.argv[2];
if (action !== "up" && action !== "down") {
  console.error("Usage: node scripts/compose.mjs up|down");
  process.exit(2);
}

if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run `pnpm setup` first.");
  process.exit(1);
}

const version = spawnSync("docker", ["compose", "version"], {
  encoding: "utf8",
});
if (version.status !== 0) {
  console.error(
    "Docker Compose is unavailable. Install a local container runtime with Compose.",
  );
  process.exit(1);
}

const args = ["compose", "--env-file", ".env.local", "-f", "compose.yaml"];
args.push(...(action === "up" ? ["up", "--build", "-d", "--wait"] : ["down"]));
const result = spawnSync("docker", args, { stdio: "inherit" });
process.exit(result.status || 0);
