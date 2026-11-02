/* eslint @typescript-eslint/no-require-imports: "off" -- Playwright loads this guard through CommonJS configuration files. */
/* global require, __dirname, exports */
const process = require("node:process");
const { URL } = require("node:url");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

// Chrome's October 27, 2026 security release fixes the four reported CVEs.
const minimumChromiumVersion = "156.0.8078.73";

function assertChromiumVersion(output) {
  const match = output.match(/\b(\d+\.\d+\.\d+\.\d+)\b/);
  if (!match)
    throw new Error("Cannot verify Chromium version; browser launch refused.");
  const actual = match[1].split(".").map(Number);
  const minimum = minimumChromiumVersion.split(".").map(Number);
  const difference = actual.findIndex(
    (value, index) => value !== minimum[index],
  );
  if (difference !== -1 && actual[difference] < minimum[difference]) {
    throw new Error(
      `Chromium ${match[1]} is below the security floor ${minimumChromiumVersion}. Use the isolated browser runner or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a patched browser.`,
    );
  }
  return match[1];
}

function browserEndpoint() {
  if (process.env.PW_TEST_CONNECT_WS_ENDPOINT)
    throw new Error(
      "Unset PW_TEST_CONNECT_WS_ENDPOINT; use the isolated browser runner.",
    );
  const value = process.env.SAFE_BROWSER_WS_ENDPOINT;
  if (!value) return undefined;
  const url = new URL(value);
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "SAFE_BROWSER_WS_ENDPOINT must be a loopback WebSocket URL.",
    );
  }
  return value;
}

function browserNetwork() {
  const settings = JSON.parse(
    readFileSync(join(__dirname, "project.json"), "utf8"),
  );
  const ports =
    process.env.SAFE_BROWSER_ALLOWED_PORTS?.split(",") ??
    settings.allowedPorts.map(String);
  if (
    !ports.length ||
    ports.some(
      (port) => !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535,
    )
  ) {
    throw new Error(
      "SAFE_BROWSER_ALLOWED_PORTS must list local application ports separated by commas.",
    );
  }
  return ports
    .flatMap((port) => [
      `localhost:${port}`,
      `127.0.0.1:${port}`,
      `[::1]:${port}`,
    ])
    .join(",");
}

function chromiumLaunchOptions(chromium, options = {}) {
  if (
    options.chromiumSandbox === false ||
    options.ignoreDefaultArgs ||
    options.channel ||
    options.args?.some((arg) =>
      /^--(?:no-sandbox|disable-.*sandbox|single-process)(?:=|$)/.test(arg),
    )
  ) {
    throw new Error(
      "Browser options bypass the required Chromium sandbox or executable verification.",
    );
  }
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    options.executablePath ||
    chromium.executablePath();
  let output;
  try {
    output = execFileSync(executablePath, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 16_384,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      `Cannot verify browser ${executablePath}. Use the isolated browser runner or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a patched executable.`,
    );
  }
  assertChromiumVersion(output);
  return { ...options, executablePath, chromiumSandbox: true };
}

function chromiumTestOptions(chromium, options = {}) {
  const wsEndpoint = browserEndpoint();
  return wsEndpoint
    ? { connectOptions: { wsEndpoint, exposeNetwork: browserNetwork() } }
    : { launchOptions: chromiumLaunchOptions(chromium, options) };
}

async function launchChromium(chromium, options = {}) {
  const endpoint = browserEndpoint();
  if (!endpoint)
    return chromium.launch(chromiumLaunchOptions(chromium, options));
  const browser = await chromium.connect(endpoint, {
    exposeNetwork: browserNetwork(),
  });
  try {
    assertChromiumVersion(browser.version());
    return browser;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

exports.minimumChromiumVersion = minimumChromiumVersion;
exports.assertChromiumVersion = assertChromiumVersion;
exports.browserEndpoint = browserEndpoint;
exports.browserNetwork = browserNetwork;
exports.chromiumLaunchOptions = chromiumLaunchOptions;
exports.chromiumTestOptions = chromiumTestOptions;
exports.launchChromium = launchChromium;
