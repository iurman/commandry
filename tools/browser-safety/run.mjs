import console from "node:console";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { assertChromiumVersion, browserNetwork } from "./browser-safety.cjs";

const directory = dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(
  readFileSync(join(directory, "project.json"), "utf8"),
);
const packageRoot = resolve(directory, "../..", settings.packageDirectory);
const require = createRequire(join(packageRoot, "package.json"));
const packageName = settings.playwrightPackage;
const version = require(`${packageName}/package.json`).version;
const chromium = require(packageName).chromium;
const separator = process.argv.indexOf("--");
const command = separator === -1 ? [] : process.argv.slice(separator + 1);
if (!command.length)
  throw new Error(
    "Usage: node tools/browser-safety/run.mjs -- <command> [arguments]",
  );
if (process.env.PW_TEST_CONNECT_WS_ENDPOINT)
  throw new Error(
    "Unset PW_TEST_CONNECT_WS_ENDPOINT; the isolated runner owns the browser connection.",
  );

const candidates = [
  ["podman"],
  ["docker"],
  ["flatpak-spawn", "--host", "/usr/bin/podman"],
  ["flatpak-spawn", "--host", join(homedir(), ".local/bin/docker")],
];
const runtime = candidates.find(
  ([bin, ...prefix]) =>
    spawnSync(bin, [...prefix, "info"], { stdio: "ignore", timeout: 15_000 })
      .status === 0,
);
if (!runtime)
  throw new Error(
    "No working local Podman or Docker runtime. On Bazzite, use the existing host Podman through flatpak-spawn.",
  );
function run(args, options = {}) {
  return spawnSync(runtime[0], [...runtime.slice(1), ...args], {
    encoding: "utf8",
    timeout: 30_000,
    ...options,
  });
}
function checked(args, options) {
  const result = run(args, options);
  if (result.status !== 0)
    throw new Error(
      `Container command failed: ${result.stderr || result.error?.message || result.status}`,
    );
  return result.stdout?.trim();
}

const suffix = randomBytes(12).toString("hex");
const name = `qa-browser-${suffix}`;
const image = `localhost/qa-browser:playwright-${version}`;
const token = randomBytes(32).toString("hex");
let started = false;
let child;
let interrupted = false;
let exitCode;
const stopChild = () => {
  interrupted = true;
  child?.kill("SIGTERM");
};
process.once("SIGINT", stopChild);
process.once("SIGTERM", stopChild);
try {
  checked(
    [
      "build",
      "--pull",
      ...(process.env.SAFE_BROWSER_REBUILD === "1" ? ["--no-cache"] : []),
      "--build-arg",
      `PLAYWRIGHT_VERSION=${version}`,
      "--tag",
      image,
      directory,
    ],
    { stdio: "inherit", timeout: 15 * 60_000 },
  );
  if (interrupted)
    throw new Error("Browser command interrupted before startup.");
  checked([
    "run",
    "--detach",
    "--name",
    name,
    "--init",
    "--read-only",
    "--user",
    "1000:1000",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--security-opt",
    `seccomp=${join(directory, "seccomp_profile.json")}`,
    "--pids-limit=512",
    "--memory=2g",
    "--cpus=2",
    "--shm-size=512m",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=512m,mode=1777",
    "--publish",
    "127.0.0.1::3333",
    "--env",
    `BROWSER_WS_PATH=${token}`,
    image,
  ]);
  started = true;
  const mounts = JSON.parse(
    checked(["inspect", name, "--format", "{{json .Mounts}}"]),
  );
  if (mounts.length)
    throw new Error("Browser container unexpectedly has filesystem mounts.");
  const address = checked(["port", name, "3333/tcp"]);
  const port = address.match(/127\.0\.0\.1:(\d+)/)?.[1];
  if (!port) throw new Error(`Unexpected browser port mapping: ${address}`);
  const endpoint = `ws://127.0.0.1:${port}/${token}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (interrupted)
      throw new Error("Browser command interrupted during readiness.");
    const logResult = run(["logs", name]);
    const logs = `${logResult.stdout || ""}${logResult.stderr || ""}`;
    if (logs.includes("Browser sandbox verified; ready.")) {
      ready = true;
      break;
    }
    if (checked(["inspect", name, "--format", "{{.State.Running}}"]) !== "true")
      throw new Error(`Browser service stopped: ${logs}`);
    await delay(500);
  }
  if (!ready)
    throw new Error(
      "Browser did not pass its sandbox readiness check within 30 seconds.",
    );
  const browser = await chromium.connect(endpoint, {
    exposeNetwork: browserNetwork(),
  });
  try {
    assertChromiumVersion(browser.version());
    const page = await browser.newPage();
    await page.setContent(
      "<!doctype html><title>isolated browser smoke</title><p>ready</p>",
    );
    if ((await page.title()) !== "isolated browser smoke")
      throw new Error("Browser smoke failed.");
    await page.close();
  } finally {
    await browser.close();
  }
  if (interrupted)
    throw new Error("Browser command interrupted before execution.");
  console.log(
    `Isolated Chromium passed version, sandbox and page checks (Playwright ${version}).`,
  );
  child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, SAFE_BROWSER_WS_ENDPOINT: endpoint },
  });
  exitCode = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => accept(code ?? 1));
  });
  if (exitCode !== 0) {
    const diagnostics = run(["logs", "--tail", "30", name]);
    console.error(`${diagnostics.stdout || ""}${diagnostics.stderr || ""}`);
  }
} finally {
  if (started) {
    run(["stop", "--time", "5", name]);
    const removed = run(["rm", name]);
    if (removed.status !== 0) {
      console.error(`Could not confirm browser cleanup: ${name}`);
      exitCode = 1;
    }
  }
  process.removeListener("SIGINT", stopChild);
  process.removeListener("SIGTERM", stopChild);
}
process.exitCode = exitCode;
