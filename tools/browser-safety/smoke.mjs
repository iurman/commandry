import console from "node:console";
import process from "node:process";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser-safety.cjs";

const directory = dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(
  readFileSync(resolve(directory, "project.json"), "utf8"),
);
const require = createRequire(
  resolve(directory, "../..", settings.packageDirectory, "package.json"),
);
const { chromium } = require(settings.playwrightPackage);
const server = createServer((request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(
    "<!doctype html><title>local QA fixture</title><button>Run</button><script>document.querySelector('button').onclick=()=>document.title='clicked';</script>",
  );
});
const denied = createServer((request, response) =>
  response.end("must not be reached"),
);
await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
await new Promise((accept) => denied.listen(0, "127.0.0.1", accept));
process.env.SAFE_BROWSER_ALLOWED_PORTS = String(server.address().port);
let browser;
try {
  browser = await launchChromium(chromium);
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.equal(await page.title(), "local QA fixture");
  await page.getByRole("button", { name: "Run" }).click();
  assert.equal(await page.title(), "clicked");
  assert.equal((await page.screenshot()).subarray(1, 4).toString(), "PNG");
  await assert.rejects(
    page.goto(`http://127.0.0.1:${denied.address().port}`, { timeout: 5000 }),
  );
  const constrained = await chromium.connect(
    process.env.SAFE_BROWSER_WS_ENDPOINT,
    {
      headers: {
        "x-playwright-launch-options": JSON.stringify({
          chromiumSandbox: false,
          executablePath: "/does-not-exist",
        }),
      },
    },
  );
  try {
    const check = await constrained.newPage();
    await check.goto("chrome://sandbox");
    assert.match(
      await check.locator("body").innerText(),
      /Seccomp-BPF sandbox\s+Yes/,
    );
  } finally {
    await constrained.close();
  }
  console.log(
    `PASS: patched Chromium ${browser.version()}, local HTTP, interaction, screenshot and denial of an unapproved host port.`,
  );
} finally {
  if (browser) await browser.close();
  await Promise.all([
    new Promise((accept) => server.close(accept)),
    new Promise((accept) => denied.close(accept)),
  ]);
}
