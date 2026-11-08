// Renders the social image and touch icon from the running site's own fonts:
//
//   SAFE_BROWSER_ALLOWED_PORTS=3100 pnpm browser:isolated \
//     node apps/site/scripts/social-card.mjs http://localhost:3100
//
// Writes apps/site/public/_site/og.png (1200x630) and apple-icon.png (180x180).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public", "_site");
const endpoint = process.env.SAFE_BROWSER_WS_ENDPOINT;
if (!endpoint) throw new Error("Run through pnpm browser:isolated.");

const browser = await chromium.connect(endpoint, {
  timeout: 30_000,
  exposeNetwork: "localhost:3100,127.0.0.1:3100",
});

// Reuse the exact font files the deployed page serves.
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(base, { waitUntil: "networkidle" });
const fonts = await page.evaluate(() => {
  const preloaded = new Set(
    [...document.querySelectorAll('link[rel="preload"][as="font"]')].map(
      (link) => link.href,
    ),
  );
  const found = {};
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style
        .getPropertyValue("font-family")
        .replace(/['"]/g, "");
      const url = rule.style
        .getPropertyValue("src")
        .match(/url\("?([^")]+)"?\)/)?.[1];
      if (!url) continue;
      const absolute = new URL(url, sheet.href ?? location.href).href;
      if (preloaded.has(absolute))
        found[family.includes("Mono") ? "mono" : "sans"] = absolute;
    }
  }
  return found;
});
if (!fonts.sans || !fonts.mono)
  throw new Error(`Fonts not found: ${JSON.stringify(fonts)}`);
const mark = readFileSync(join(publicDir, "icon.svg"), "utf8");
const face = (family, url) =>
  `@font-face{font-family:"${family}";src:url("${url}") format("woff2");font-weight:100 900;font-stretch:75% 125%;}`;

const steps = ["Observe", "Relate", "Recall", "Plan", "Brief"];
await page.setContent(`<!doctype html><html><head><style>
${face("A", fonts.sans)}${face("B", fonts.mono)}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0b0f13;color:#eef2f6;font-family:"A","B",sans-serif;position:relative;overflow:hidden}
.light{position:absolute;inset:0;background:radial-gradient(900px 520px at 0% -10%,rgba(126,156,196,.18),transparent 62%)}
.brand{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:16px;font-size:30px;font-weight:620;font-variation-settings:"wdth" 112;letter-spacing:-.01em}
.brand svg{width:44px;height:44px}
h1{position:absolute;left:72px;top:176px;width:700px;font-size:76px;line-height:.96;font-weight:560;letter-spacing:-.045em;font-variation-settings:"wdth" 108}
h1 span{color:#7c8794}
.foot{position:absolute;left:72px;bottom:60px;font-size:22px;color:#a8b3bf}
svg.c{position:absolute;right:56px;top:96px;width:330px;height:420px;overflow:visible}
.c path{fill:none;stroke:rgba(167,200,255,.5);stroke-width:2.5;stroke-linecap:round}
.c text{fill:#a8b3bf;font-size:15px;letter-spacing:.08em;font-family:"B","A",monospace}
</style></head><body><div class="light"></div>
<div class="brand">${mark}<span>Commandry</span></div>
<h1>Everything you build and run, <span>held in one connected model.</span></h1>
<p class="foot">A personal operations system. In development.</p>
<svg class="c" viewBox="0 0 470 520">
<path d="M 404 70 H 250 C 140 70 60 154 60 260 C 60 366 140 450 250 450 H 404"/>
<circle cx="404" cy="70" r="13" fill="#0b0f13" stroke="#a7c8ff" stroke-width="3"/>
<circle cx="404" cy="450" r="13" fill="#a7c8ff"/>
<circle cx="113" cy="128" r="7" fill="#0b0f13" stroke="#a7c8ff" stroke-width="2.5"/>
<circle cx="60" cy="260" r="7" fill="#0b0f13" stroke="#a7c8ff" stroke-width="2.5"/>
<circle cx="113" cy="392" r="7" fill="#0b0f13" stroke="#a7c8ff" stroke-width="2.5"/>
<text x="404" y="38" text-anchor="end">${steps[0].toUpperCase()}</text>
<text x="133" y="134">${steps[1].toUpperCase()}</text>
<text x="80" y="266">${steps[2].toUpperCase()}</text>
<text x="133" y="398">${steps[3].toUpperCase()}</text>
<text x="404" y="494" text-anchor="end">${steps[4].toUpperCase()}</text>
</svg></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(publicDir, "og.png") });

const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
await icon.setContent(
  `<html><body style="margin:0;background:#17212b">${mark.replace("<svg ", '<svg style="display:block;width:180px;height:180px" ')}</body></html>`,
);
await icon.screenshot({ path: join(publicDir, "apple-icon.png") });
await browser.close();
console.log("Wrote og.png and apple-icon.png");
