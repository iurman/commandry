import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { detectContainerRuntime } from "./container-runtime.mjs";

const results = [];

function check(name, okay, detail) {
  results.push({ name, okay, detail });
  console.log(`${okay ? "OK" : "FAIL"} ${name}: ${detail}`);
}

check(
  "Node.js",
  process.versions.node.split(".")[0] === "24",
  `found ${process.version}; required major 24`,
);

const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
const pnpmVersion = pnpm.status === 0 ? pnpm.stdout.trim() : "unavailable";
check(
  "pnpm",
  pnpmVersion === "11.19.0",
  `found ${pnpmVersion}; required 11.19.0`,
);

const envPath = ".env.local";
const envExists = existsSync(envPath);
check(
  "local environment",
  envExists,
  envExists ? `${envPath} exists` : "run pnpm setup",
);
if (envExists && process.platform !== "win32") {
  const mode = statSync(envPath).mode & 0o777;
  check(
    "environment permissions",
    (mode & 0o077) === 0,
    `${envPath} mode ${mode.toString(8)}`,
  );
}

const runtime = detectContainerRuntime();
check(
  "container Compose",
  runtime !== null,
  runtime
    ? `${runtime.description}: ${runtime.version}`
    : "unavailable; local containers cannot start",
);

if (results.some((result) => !result.okay)) process.exitCode = 1;
