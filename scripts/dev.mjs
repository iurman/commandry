import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawn, spawnSync } from "node:child_process";

if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run `pnpm setup` first.");
  process.exit(1);
}
loadEnvFile(".env.local");

const docker = spawnSync("docker", ["compose", "version"], {
  encoding: "utf8",
});
if (docker.status !== 0) {
  console.error(
    "Docker Compose is unavailable. `pnpm dev` needs local PostgreSQL 18.",
  );
  process.exit(1);
}

const postgres = spawnSync(
  "docker",
  [
    "compose",
    "--env-file",
    ".env.local",
    "-f",
    "compose.yaml",
    "-f",
    "compose.dev.yaml",
    "up",
    "-d",
    "--wait",
    "postgres",
  ],
  { stdio: "inherit" },
);
if (postgres.status !== 0) {
  console.error(
    "Local PostgreSQL did not become healthy. Inspect `docker compose ps` and logs.",
  );
  process.exit(postgres.status || 1);
}

const migrate = spawnSync(
  "pnpm",
  ["--filter", "@commandry/worker", "migrate"],
  {
    stdio: "inherit",
    env: process.env,
  },
);
if (migrate.status !== 0) {
  console.error("Local migrations failed; web and worker were not started.");
  process.exit(migrate.status || 1);
}

const children = [
  spawn("pnpm", ["--filter", "@commandry/web", "dev"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn("pnpm", ["--filter", "@commandry/worker", "dev"], {
    stdio: "inherit",
    env: process.env,
  }),
];

function stop(signal = "SIGTERM") {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
for (const child of children) {
  child.on("exit", (code) => {
    stop();
    process.exitCode = code || 0;
  });
  child.on("error", (error) => {
    console.error(`Development process failed: ${error.message}`);
    stop();
    process.exitCode = 1;
  });
}
