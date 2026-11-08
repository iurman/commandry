// Visual and behavioral QA for the public site, run through the guarded
// isolated browser:
//
//   SAFE_BROWSER_ALLOWED_PORTS=3100 pnpm browser:isolated \
//     node apps/site/scripts/qa.mjs http://localhost:3100 <output-dir>
//
// It writes screenshots and a JSON report. Review the images; passing checks
// are not a substitute for looking at the result.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "site-qa";
const endpoint = process.env.SAFE_BROWSER_WS_ENDPOINT;
if (!endpoint) throw new Error("Run through pnpm browser:isolated.");
mkdirSync(out, { recursive: true });

const ports = (process.env.SAFE_BROWSER_ALLOWED_PORTS ?? "3100").split(",");
const browser = await chromium.connect(endpoint, {
  timeout: 30_000,
  exposeNetwork: ports
    .flatMap((p) => [`localhost:${p}`, `127.0.0.1:${p}`])
    .join(","),
});

const report = { base, checks: [], console: [], failedRequests: [] };
const check = (name, pass, detail = "") => {
  report.checks.push({ name, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`,
  );
};

async function open(options = {}) {
  // With JavaScript disabled, Chromium refuses script requests by design.
  const trackRequests = options.javaScriptEnabled !== false;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ...options,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      report.console.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) =>
    report.console.push(`pageerror: ${error.message}`),
  );
  page.on("requestfailed", (request) => {
    if (trackRequests)
      report.failedRequests.push(
        `${request.url()} ${request.failure()?.errorText}`,
      );
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico"))
      report.failedRequests.push(`${response.status()} ${response.url()}`);
  });
  return { context, page };
}

const viewports = [
  ["desktop", 1440, 900],
  ["laptop", 1280, 800],
  ["tablet", 768, 1024],
  ["phone", 390, 844],
  ["narrow", 320, 640],
];

for (const [name, width, height] of viewports) {
  const { context, page } = await open({ viewport: { width, height } });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, `${name}-top.png`) });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right >
          document.documentElement.clientWidth + 0.25,
      )
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
  );
  check(
    `${name}: no horizontal overflow`,
    overflow <= 0,
    `${overflow}px ${wide.join(" ")}`,
  );
  await page.locator("#model").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600);
  await page.screenshot({
    path: join(out, `${name}-full.png`),
    fullPage: true,
  });
  await context.close();
}

// Motion: sample the scene's packet layer over time and confirm a dot moves.
{
  const { context, page } = await open();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#model").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const samples = [];
  for (let i = 0; i < 6; i += 1) {
    samples.push(
      await page.evaluate(() => {
        const head = document.querySelector(
          ".stage[data-layout=wide] .pk-head",
        );
        return head
          ? [Number(head.getAttribute("cx")), Number(head.getAttribute("cy"))]
          : null;
      }),
    );
    await page.screenshot({
      path: join(out, `motion-frame-${i}.png`),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    await page.waitForTimeout(160);
  }
  const points = samples.filter(Boolean);
  const moved =
    points.length > 1 &&
    points.some(
      (p, i) =>
        i > 0 && (p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]),
    );
  check("scene packet moves between frames", moved, JSON.stringify(samples));

  // Sequence advances on its own, and pause stops it.
  await page.waitForTimeout(4500);
  const current = await page
    .locator(".step[aria-current=step] .step-title")
    .textContent();
  check("sequence advances past Observe", current !== "Observe", current ?? "");
  await page
    .getByRole("button", { name: /Pause the example sequence/ })
    .click();
  const paused = await page
    .locator(".step[aria-current=step] .step-title")
    .textContent();
  await page.waitForTimeout(5000);
  const still = await page
    .locator(".step[aria-current=step] .step-title")
    .textContent();
  check(
    "pause holds the current step",
    paused === still,
    `${paused} -> ${still}`,
  );

  // Selection by keyboard opens the inspector.
  await page.locator(".stage[data-layout=wide] .node[data-kind=host]").focus();
  await page.keyboard.press("Enter");
  const inspector = await page.locator(".inspector-title").textContent();
  check(
    "keyboard selection opens inspector",
    inspector === "atlas",
    inspector ?? "",
  );
  await page.screenshot({ path: join(out, "inspector.png") });

  // Lens tabs respond to arrow keys.
  await page.locator(".lens-tab[aria-selected=true]").focus();
  await page.keyboard.press("ArrowRight");
  const lens = await page
    .locator(".lens-tab[aria-selected=true]")
    .textContent();
  check("lens tabs follow arrow keys", lens === "Work", lens ?? "");
  await page.waitForTimeout(900);
  await page.locator("#views").screenshot({ path: join(out, "lens-work.png") });

  // Checks strip pauses offscreen and on request.
  await page.locator("#signals").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const before = await page.locator(".checks .pk-head").count();
  check("check dots render while visible", before > 0, String(before));
  await page.locator("#signals").screenshot({ path: join(out, "signals.png") });
  await page.getByRole("button", { name: "Pause checks" }).click();
  const after = await page.locator(".checks .pk-head").count();
  check("pause removes check dots", after === 0, String(after));

  // Focus order begins with the skip link.
  await page.goto(base, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() =>
    document.activeElement?.textContent?.trim(),
  );
  check(
    "first tab stop is the skip link",
    first === "Skip to content",
    first ?? "",
  );
  await page.screenshot({
    path: join(out, "skip-focus.png"),
    clip: { x: 0, y: 0, width: 1440, height: 300 },
  });
  await context.close();
}

// Reduced motion: no packets, full content.
{
  const { context, page } = await open({ reducedMotion: "reduce" });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#model").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const packets = await page.locator(".pk-head").count();
  check("reduced motion: no moving dots", packets === 0, String(packets));
  await page.locator(".step").nth(4).click();
  await page.screenshot({
    path: join(out, "reduced-motion.png"),
    fullPage: true,
  });
  await context.close();
}

// No JavaScript: the server HTML carries all copy and every step.
{
  const { context, page } = await open({ javaScriptEnabled: false });
  await page.goto(base, { waitUntil: "load" });
  const text = await page.locator("main").innerText();
  const needed = [
    "Everything you build and run",
    "Observe",
    "Brief",
    "Four views",
    "Observed, never assumed",
    "Built for one operator",
  ];
  const missing = needed.filter((phrase) => !text.includes(phrase));
  check(
    "no-JS: copy and steps present",
    missing.length === 0,
    missing.join(", "),
  );
  await page.screenshot({ path: join(out, "no-js.png"), fullPage: true });
  await context.close();
}

// Enlarged text: 200% root size at a phone width must still reflow.
{
  const { context, page } = await open({
    viewport: { width: 390, height: 844 },
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right >
          document.documentElement.clientWidth + 0.25,
      )
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
  );
  check(
    "200% text: no horizontal overflow",
    overflow <= 0,
    `${overflow}px ${wide.join(" ")}`,
  );
  await page.screenshot({ path: join(out, "text-200.png"), fullPage: true });
  await context.close();
}

// Lab performance: phone viewport, 4x CPU slowdown, throttled network.
{
  const { context, page } = await open({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (!entry.hadRecentInput) {
          window.__cls += entry.value;
          window.__shifts = (window.__shifts ?? []).concat(
            `${entry.value.toFixed(3)}@${Math.round(entry.startTime)}:` +
              (entry.sources ?? [])
                .map(
                  (source) =>
                    source.node?.className?.baseVal ??
                    source.node?.className ??
                    source.node?.nodeName,
                )
                .join("|"),
          );
        }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const metrics = await page.evaluate(() => ({
    lcp: Math.round(window.__lcp),
    cls: Number(window.__cls.toFixed(4)),
    shifts: window.__shifts ?? [],
  }));
  report.performance = {
    conditions: "390x844 DPR2, CPU 4x slowdown, 150ms RTT, 1.6 Mbps down",
    ...metrics,
  };
  check("lab LCP <= 2500ms", metrics.lcp <= 2500, `${metrics.lcp}ms`);
  check(
    "lab CLS <= 0.1",
    metrics.cls <= 0.1,
    `${metrics.cls} ${metrics.shifts.join(" ; ")}`,
  );
  await context.close();
}

check(
  "no console errors",
  report.console.length === 0,
  report.console.join(" | "),
);
check(
  "no failed requests",
  report.failedRequests.length === 0,
  report.failedRequests.join(" | "),
);
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
await browser.close();
if (report.checks.some((item) => !item.pass)) process.exitCode = 1;
