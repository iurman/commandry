import process from "node:process";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import {
  assertChromiumVersion,
  browserEndpoint,
  browserNetwork,
  chromiumLaunchOptions,
  chromiumTestOptions,
  launchChromium,
} from "./browser-safety.cjs";

test("rejects all observed old browsers and the vulnerable 1.64.1 bundle", () => {
  for (const version of [
    "141.0.7390.37",
    "149.0.7827.55",
    "151.0.7922.34",
    "153.0.8010.12",
    "156.0.8078.4",
    "156.0.8078.72",
  ]) {
    assert.throws(
      () => assertChromiumVersion(`Chromium ${version}`),
      /below the security floor/,
    );
  }
  for (const version of [
    "156.0.8078.73",
    "156.0.8078.74",
    "156.0.8079.1",
    "157.0.0.0",
  ])
    assert.equal(assertChromiumVersion(version), version);
  assert.throws(() => assertChromiumVersion("unverified"), /Cannot verify/);
});

test("sandbox bypasses fail before an executable runs", () => {
  const chromium = {
    executablePath() {
      throw new Error("must not execute");
    },
  };
  for (const options of [
    { chromiumSandbox: false },
    { ignoreDefaultArgs: true },
    { ignoreDefaultArgs: [] },
    { channel: "chrome" },
    ...[
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-namespace-sandbox",
      "--single-process",
    ].map((arg) => ({ args: [arg] })),
  ]) {
    assert.throws(() => chromiumLaunchOptions(chromium, options), /bypass/);
  }
});

test("a patched executable preserves requested settings and requires sandboxing", () => {
  const dir = mkdtempSync(join(tmpdir(), "browser-policy-"));
  const executablePath = join(dir, "chromium");
  const original = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  try {
    writeFileSync(
      executablePath,
      "#!/bin/sh\nprintf '%s\\n' 'Chromium 156.0.8078.73'\n",
      { mode: 0o700 },
    );
    const result = chromiumLaunchOptions(
      { executablePath: () => executablePath },
      { headless: false, args: ["--font-render-hinting=none"] },
    );
    assert.deepEqual(result, {
      headless: false,
      args: ["--font-render-hinting=none"],
      executablePath,
      chromiumSandbox: true,
    });
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = executablePath;
    assert.equal(
      chromiumLaunchOptions({ executablePath: () => "not-installed" })
        .executablePath,
      executablePath,
    );
    writeFileSync(
      executablePath,
      "#!/bin/sh\nprintf '%s\\n' 'Chromium 156.0.8078.4'\n",
      { mode: 0o700 },
    );
    assert.throws(
      () => chromiumLaunchOptions({ executablePath: () => executablePath }),
      /below the security floor/,
    );
  } finally {
    if (original === undefined)
      delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    else process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing executables fail closed", () => {
  assert.throws(
    () =>
      chromiumLaunchOptions({
        executablePath: () => "/does-not-exist/browser",
      }),
    /Cannot verify browser/,
  );
});

test("remote endpoints are restricted to loopback and old remote browsers disconnect", async () => {
  const original = process.env.SAFE_BROWSER_WS_ENDPOINT;
  try {
    for (const endpoint of [
      "ws://example.com/browser",
      "https://127.0.0.1/browser",
      "ws://user:password@localhost/browser",
    ]) {
      process.env.SAFE_BROWSER_WS_ENDPOINT = endpoint;
      assert.throws(browserEndpoint, /loopback/);
    }
    process.env.SAFE_BROWSER_WS_ENDPOINT = "ws://127.0.0.1:3333/token";
    assert.deepEqual(
      chromiumTestOptions({
        executablePath() {
          throw new Error("local binary must not execute");
        },
      }),
      {
        connectOptions: {
          wsEndpoint: process.env.SAFE_BROWSER_WS_ENDPOINT,
          exposeNetwork: browserNetwork(),
        },
      },
    );
    let closed = false;
    const chromium = {
      async connect() {
        return {
          version: () => "156.0.8078.4",
          async close() {
            closed = true;
          },
        };
      },
    };
    await assert.rejects(launchChromium(chromium), /below the security floor/);
    assert.equal(closed, true);
  } finally {
    if (original === undefined) delete process.env.SAFE_BROWSER_WS_ENDPOINT;
    else process.env.SAFE_BROWSER_WS_ENDPOINT = original;
  }
});

test("host forwarding requires explicit local application ports", () => {
  const original = process.env.SAFE_BROWSER_ALLOWED_PORTS;
  try {
    process.env.SAFE_BROWSER_ALLOWED_PORTS = "3000,3141";
    assert.equal(
      browserNetwork(),
      "localhost:3000,127.0.0.1:3000,[::1]:3000,localhost:3141,127.0.0.1:3141,[::1]:3141",
    );
    for (const value of [
      "*",
      "<loopback>",
      "0",
      "65536",
      "3000,",
      "example.com:3000",
    ]) {
      process.env.SAFE_BROWSER_ALLOWED_PORTS = value;
      assert.throws(browserNetwork, /local application ports/);
    }
  } finally {
    if (original === undefined) delete process.env.SAFE_BROWSER_ALLOWED_PORTS;
    else process.env.SAFE_BROWSER_ALLOWED_PORTS = original;
  }
});

test("tracked browser entrypoints cannot bypass the shared launch guard", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).split("\0");
  const failures = [];
  for (const file of files) {
    if (
      !/\.[cm]?[jt]sx?$/.test(file) ||
      file.startsWith("tools/browser-safety/") ||
      file.includes("node_modules/") ||
      /\.(test|spec)\./.test(file)
    )
      continue;
    const text = readFileSync(join(root, file), "utf8");
    if (
      /\bchromium\s*\.\s*(launch|launchPersistentContext|launchServer)\s*\(/.test(
        text,
      )
    )
      failures.push(`${file}: unguarded Chromium launch`);
    if (/--no-sandbox\b/.test(text)) failures.push(`${file}: sandbox disabled`);
  }
  assert.deepEqual(failures, []);
});
