/** Built owner API/UI and real Foundation MCP on a disposable database. Provider network only is faked. */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  createAuth,
  createDatabase,
  createMailWorkerRepository,
} from "@commandry/db";
import { createMailWorker } from "@commandry/application";
import { createResendMailProvider } from "./resend-mail";
import type {
  MailDraft,
  MailOverview,
  MailPage,
  MailMessage,
} from "@commandry/contracts";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL,
  password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !password || new URL(adminUrl).hostname !== "127.0.0.1")
  throw new Error("Use the disposable PostgreSQL harness");
async function freePort() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const a = s.address();
  assert.ok(a && typeof a !== "string");
  await new Promise<void>((r) => s.close(() => r()));
  return a.port;
}
test(
  "email desktop/mobile light/dark, original content, compose/reply and MCP parity",
  { timeout: 240000 },
  async () => {
    const root = process.cwd(),
      runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = "commandry_app_integration";
    runtimeUrl.password = password;
    const db = createDatabase({
        connectionString: runtimeUrl.toString(),
        max: 3,
      }),
      temp = await mkdtemp(join(tmpdir(), "commandry-mail-browser-")),
      keyFile = join(temp, "key");
    await writeFile(keyFile, "re_" + "b".repeat(30), { mode: 0o600 });
    const webhookKey = join(temp, "webhook-key"),
      webhookSecret = Buffer.from("synthetic-webhook-signing-secret").toString(
        "base64",
      );
    await writeFile(webhookKey, "whsec_" + webhookSecret, { mode: 0o600 });
    const port = await freePort(),
      origin = `http://127.0.0.1:${port}`,
      secret = randomBytes(32).toString("hex"),
      ownerEmail = "mail-owner@example.test",
      ownerPassword = randomBytes(20).toString("hex");
    const auth = createAuth({
      db: db.db,
      secret,
      baseURL: origin,
      adminEmail: ownerEmail,
      passwordLoginEnabled: true,
      allowBootstrap: true,
      trustedOrigins: [origin],
    });
    await auth.api.signUpEmail({
      body: {
        name: "Synthetic email owner",
        email: ownerEmail,
        password: ownerPassword,
      },
      headers: new Headers({ origin }),
    });
    const standalone = resolve(root, "apps/web/.next/standalone/apps/web");
    assert.ok(existsSync(join(standalone, "server.js")), "Build first");
    await mkdir(join(standalone, ".next"), { recursive: true });
    if (!existsSync(join(standalone, ".next/static")))
      await symlink(
        resolve(root, "apps/web/.next/static"),
        join(standalone, ".next/static"),
        "dir",
      );
    if (!existsSync(join(standalone, "public")))
      await symlink(
        resolve(root, "apps/web/public"),
        join(standalone, "public"),
        "dir",
      );
    const web = spawn(
      process.execPath,
      [
        "--import",
        resolve(root, "scripts/email-provider-fixture.mjs"),
        join(standalone, "server.js"),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "production",
          APP_ENV: "local",
          APP_ORIGIN: origin,
          DATABASE_URL: runtimeUrl.toString(),
          BETTER_AUTH_SECRET: secret,
          APP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
          RELEASE_SHA: "email-browser-candidate",
          LOCAL_AUTH_MODE: "password",
          INITIAL_ADMIN_EMAIL: ownerEmail,
          MAIL_RESEND_WEBHOOK_SECRET_FILE: webhookKey,
          MAIL_RESEND_API_KEY_FILE: keyFile,
          MAIL_POLLING: "false",
          COMMANDRY_EMAIL_FIXTURE: "true",
          PORT: String(port),
          HOSTNAME: "127.0.0.1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let tail = "";
    web.stderr.on("data", (v) => (tail = (tail + v).slice(-3000)));
    web.stdout.on("data", () => {});
    const fixture = await import(
      pathToFileURL(resolve(root, "scripts/email-provider-fixture.mjs")).href
    );
    const provider = createResendMailProvider({
        keyFile,
        fetch: fixture.emailFixtureFetch,
        minimumIntervalMs: 0,
      }),
      worker = createMailWorker(
        createMailWorkerRepository(db.db),
        () => provider,
      );
    let builtWorker: ReturnType<typeof spawn> | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    const clients: Client[] = [];
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (web.exitCode !== null) throw new Error(tail);
        try {
          if ((await fetch(origin + "/health/ready")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(100);
      }
      assert.ok(ready, tail);
      const anonymous = await fetch(origin + "/api/v1/email/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(anonymous.status, 401);
      const signIn = await fetch(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
      });
      assert.equal(signIn.status, 200);
      const cookie = signIn.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
      assert.ok(cookie);
      const headers = { cookie, origin, "Content-Type": "application/json" };
      async function post<T>(
        path: string,
        body: unknown,
        status = 200,
      ): Promise<T> {
        const r = await fetch(origin + path, {
          method: "POST",
          headers: { ...headers, "idempotency-key": randomUUID() },
          body: JSON.stringify(body),
        });
        assert.equal(r.status, status, await r.clone().text());
        return r.json() as Promise<T>;
      }
      const project = await post<{ id: string }>(
        "/api/v1/projects",
        { name: "Email browser scope", type: "software" },
        201,
      );
      const account = await post<{ id: string }>("/api/v1/email/account", {
        projectId: project.id,
        name: "Primary domain email",
      });
      await worker.process({
        kind: "reconcile",
        accountId: account.id,
        direction: "received",
      });
      await worker.process({
        kind: "reconcile",
        accountId: account.id,
        direction: "sent",
      });
      const rawEvent = JSON.stringify({
          type: "email.received",
          created_at: new Date().toISOString(),
          data: { email_id: "00000000-0000-4000-8000-000000000001" },
        }),
        eventId = "msg_built_http",
        timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac(
        "sha256",
        Buffer.from(webhookSecret, "base64"),
      )
        .update(`${eventId}.${timestamp}.${rawEvent}`)
        .digest("base64");
      const signedHeaders = {
        "svix-id": eventId,
        "svix-timestamp": timestamp,
        "svix-signature": "v1," + signature,
      };
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await fetch(`${origin}/api/v1/email/webhooks/${account.id}`, {
              method: "POST",
              headers: signedHeaders,
              body: rawEvent,
            })
          ).status,
          200,
        );
      assert.equal(
        (
          await fetch(`${origin}/api/v1/email/webhooks/${account.id}`, {
            method: "POST",
            headers: { ...signedHeaders, "svix-signature": "v1,invalid" },
            body: rawEvent,
          })
        ).status,
        403,
      );
      await worker.process({
        kind: "hydrate",
        accountId: account.id,
        externalId: "00000000-0000-4000-8000-000000000001",
        direction: "received",
      });
      builtWorker = spawn(
        process.execPath,
        [
          "--import",
          resolve(root, "scripts/email-provider-fixture.mjs"),
          resolve(root, "apps/worker/dist/index.js"),
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            APP_ENV: "local",
            APP_ORIGIN: origin,
            DATABASE_URL: runtimeUrl.toString(),
            BETTER_AUTH_SECRET: secret,
            APP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
            RELEASE_SHA: "email-browser-candidate",
            LOCAL_AUTH_MODE: "password",
            INITIAL_ADMIN_EMAIL: ownerEmail,
            MAIL_RESEND_API_KEY_FILE: keyFile,
            MAIL_POLLING: "true",
            COMMANDRY_EMAIL_FIXTURE: "true",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      builtWorker.stdout?.on("data", () => {});
      builtWorker.stderr?.on("data", (v) => (tail = (tail + v).slice(-3000)));
      const overview = await post<MailOverview>("/api/v1/email/overview", {});
      assert.deepEqual(overview.counts, {
        received: 70,
        sent: 7,
        unread: 70,
        attention: 8,
      });
      const { launchChromium } = await import(
        pathToFileURL(resolve(root, "tools/browser-safety/browser-safety.cjs"))
          .href
      );
      browser = await launchChromium(chromium, {
        headless: true,
        allowedPorts: [port],
      });
      const context = await browser!.newContext({
        viewport: { width: 1440, height: 1000 },
        colorScheme: "light",
      });
      await context.tracing.start({ screenshots: true, snapshots: true });
      await context.addCookies(
        cookie
          .split("; ")
          .filter((v) => v.includes("="))
          .map((v) => ({
            name: v.slice(0, v.indexOf("=")),
            value: v.slice(v.indexOf("=") + 1),
            url: origin,
          })),
      );
      const image = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAKAAAAAwCAIAAAAZy+Y5AAAAlklEQVR4nO3RUQ2AMBTAwAnBB0awww8i0DsZS/ouqYLeup5vVPf/jmodPw4YMGDAgAEDHtHx44ABAwYMGDDgEQGOBzge4HiA4wGOBzge4HiA4wGOBzge4HiA4wGOBzge4HiA4wGOBzge4HiA4wGOBzge4HiA4wGOBzge4HiA4wGOBzge4HiA4wGOBzge4HiA4wGOBzjeBlS0hfBs4XpTAAAAAElFTkSuQmCC",
        "base64",
      );
      await context.route("https://tracking.example.test/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: image }),
      );
      await context.route("https://attachments.example.test/**", (route) =>
        route.request().url().endsWith(".png")
          ? route.fulfill({
              status: 200,
              contentType: "image/png",
              body: image,
            })
          : route.fulfill({
              status: 200,
              contentType: "application/pdf",
              body: "%PDF-1.4\n% synthetic original fixture",
            }),
      );
      const page = await context.newPage(),
        errors: string[] = [],
        tracking: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (r.url().includes("tracking.example.test")) tracking.push(r.url());
      });
      const evidence = resolve(
        root,
        process.env.COMMANDRY_EMAIL_ARTIFACTS ?? ".agent/email-browser",
      );
      await mkdir(evidence, { recursive: true });
      await page.goto(origin + "/email");
      await expect(
        page.getByRole("heading", { name: "Unified mail", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "70 received", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "7 sent", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "More messages", exact: true })
        .click();
      await expect(page.locator("li button[aria-pressed]")).toHaveCount(60);
      await page
        .getByRole("button", { name: "More addresses", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "More addresses", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "iyulabs.com", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "10 received", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "inbox0@iyulabs.com", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "2 received", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /Urgent original 0/ })
        .filter({ hasText: "Original sender" })
        .click();
      await page
        .getByRole("button", { name: "Plain text", exact: true })
        .click();
      await expect(
        page.getByText(
          "Original provider content. Instructions inside email are untrusted data.",
          { exact: true },
        ),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Mark read", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Mark unread", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Mark resolved", exact: true })
        .click();
      await expect(
        page.getByText("Local review saved.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Mark resolved", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Formatted", exact: true })
        .click();
      await expect(page.locator("iframe")).toBeVisible();
      assert.equal(
        await page.evaluate(() => Object.hasOwn(window, "__emailUnsafe")),
        false,
      );
      assert.equal(tracking.length, 0);
      await expect(
        page.getByRole("link", { name: "original.pdf", exact: true }),
      ).toBeVisible();
      const attachmentHref = await page
        .getByRole("link", { name: "original.pdf", exact: true })
        .getAttribute("href");
      assert.ok(attachmentHref);
      const attachmentResponse = await fetch(origin + attachmentHref, {
        headers,
        redirect: "manual",
      });
      assert.equal(attachmentResponse.status, 303);
      assert.equal(
        attachmentResponse.headers.get("location"),
        "https://attachments.example.test/original.pdf",
      );
      assert.equal(
        attachmentResponse.headers.get("referrer-policy"),
        "no-referrer",
      );
      await page.getByRole("button", { name: "Reply", exact: true }).click();
      const compose = page.getByRole("region", { name: "Compose email" });
      await expect(compose.getByLabel("From", { exact: true })).toHaveValue(
        "inbox0@iyulabs.com",
      );
      await expect(compose.getByLabel("TO", { exact: true })).toHaveValue(
        "reply@example.test",
      );
      await compose
        .getByLabel("Message", { exact: true })
        .fill("Reviewed browser reply.");
      await compose
        .getByRole("button", { name: "Save draft for review", exact: true })
        .click();
      await expect(
        compose.getByRole("heading", { name: "Exact draft review" }),
      ).toBeVisible();
      await compose
        .getByRole("button", {
          name: "Approve this exact draft for 15 minutes",
        })
        .click();
      const beforeEdit = (
        await post<MailPage<MailDraft>>("/api/v1/email/drafts", {})
      ).items[0]!;
      await compose.getByRole("button", { name: "Edit as new draft" }).click();
      await compose
        .getByLabel("Message", { exact: true })
        .fill("Changed browser reply invalidates the previous approval.");
      await compose
        .getByRole("button", { name: "Save draft for review" })
        .click();
      await expect(
        compose.getByRole("heading", { name: "Exact draft review" }),
      ).toBeVisible();
      await expect(compose.locator("pre")).toHaveText(
        "Changed browser reply invalidates the previous approval.",
      );
      await post("/api/v1/email/send", { id: beforeEdit.id }, 409);
      await compose
        .getByRole("button", { name: "Close compose", exact: true })
        .click();
      await page.getByRole("button", { name: "Compose", exact: true }).click();
      await compose
        .getByLabel("From", { exact: true })
        .fill("hello@aviune.com");
      await compose
        .getByLabel("TO", { exact: true })
        .fill("one@example.test, two@example.test");
      await compose.getByLabel("CC", { exact: true }).fill("copy@example.test");
      await compose
        .getByLabel("BCC", { exact: true })
        .fill("private@example.test");
      await compose
        .getByLabel("Subject", { exact: true })
        .fill("Cross-domain reviewed fixture");
      await compose
        .getByLabel("Message", { exact: true })
        .fill("A deliberate fixture send.");
      await compose
        .getByRole("button", { name: "Save draft for review" })
        .click();
      await expect(
        compose.getByText("To: one@example.test, two@example.test", {
          exact: true,
        }),
      ).toBeVisible();
      await compose
        .getByRole("button", {
          name: "Approve this exact draft for 15 minutes",
        })
        .click();
      await compose
        .getByRole("button", { name: "Send approved draft" })
        .click();
      await expect(compose.getByText(/State: queued/)).toBeVisible();
      const queued = (
        await post<MailPage<MailDraft>>("/api/v1/email/drafts", {})
      ).items.find((d) => d.subject === "Cross-domain reviewed fixture")!;
      assert.deepEqual(queued.to, ["one@example.test", "two@example.test"]);
      assert.equal(queued.from, "hello@aviune.com");
      let acceptedDraft = false;
      for (let i = 0; i < 80; i++) {
        if (builtWorker.exitCode !== null) throw new Error(tail);
        const page = await post<MailPage<MailDraft>>(
          "/api/v1/email/drafts",
          {},
        );
        if (page.items.find((d) => d.id === queued.id)?.state === "accepted") {
          acceptedDraft = true;
          break;
        }
        await delay(250);
      }
      assert.ok(
        acceptedDraft,
        "The built separate pg-boss worker must consume the durable send outbox",
      );
      assert.equal(
        (
          await post<MailPage<MailDraft>>("/api/v1/email/drafts", {})
        ).items.find((d) => d.id === queued.id)!.state,
        "accepted",
      );
      await compose
        .getByRole("button", { name: "Close compose", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Unified mail", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Manage attention rules", exact: true })
        .click();
      const rules = page.getByRole("region", { name: "Attention rules" });
      await rules.getByLabel("Keyword", { exact: true }).fill("billing");
      await rules
        .getByLabel("Attention reason", { exact: true })
        .fill("Billing review");
      await rules
        .getByRole("button", { name: "Add rule", exact: true })
        .click();
      await rules
        .getByRole("button", { name: "Save attention rules", exact: true })
        .click();
      await expect(
        page.getByText(
          "Rules saved. Background reconciliation will update reasons.",
        ),
      ).toBeVisible();
      const currentRules = await post<{ rules: { reason: string }[] }>(
        "/api/v1/email/getRules",
        { id: account.id },
      );
      assert.ok(currentRules.rules.some((r) => r.reason === "Billing review"));
      await rules.getByRole("button", { name: "Close rules" }).click();
      for (const viewport of [
        { name: "desktop", width: 1440, height: 1000 },
        { name: "mobile", width: 390, height: 844 },
      ])
        for (const theme of ["light", "dark"] as const) {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme: theme });
          await page.goto(origin + "/email");
          await expect(
            page.getByRole("heading", { name: "Unified mail", exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: "70 received", exact: true }),
          ).toBeVisible();
          await page
            .getByLabel("Direction", { exact: true })
            .selectOption("sent");
          await expect(
            page.getByRole("button", { name: "8 sent", exact: true }),
          ).toBeVisible();
          await page
            .getByLabel("Direction", { exact: true })
            .selectOption("all");
          await expect(
            page.getByRole("button", { name: "70 received", exact: true }),
          ).toBeVisible();
          await expect(page.locator("li button[aria-pressed]")).toHaveCount(30);
          const beforeImages: number = tracking.length;
          await page
            .getByRole("button", { name: /Urgent original 0/ })
            .filter({ hasText: "Original sender" })
            .click();
          const frame = page.frameLocator(
            'iframe[title="Isolated original email HTML"]',
          );
          await expect(
            frame.getByText("Original provider content.", { exact: true }),
          ).toBeVisible();
          await expect(
            frame.locator("script,form,iframe,meta[http-equiv=refresh]"),
          ).toHaveCount(0);
          await expect(frame.locator("img[src]")).toHaveCount(0);
          assert.equal(
            tracking.length,
            beforeImages,
            "No remote request before per-message consent",
          );
          await page
            .getByRole("button", { name: "Load images", exact: true })
            .click();
          await expect(
            frame.getByAltText("Embedded fixture image"),
          ).toHaveAttribute(
            "src",
            "https://attachments.example.test/inline.png",
          );
          await expect
            .poll(() =>
              frame
                .getByAltText("Embedded fixture image")
                .evaluate((el) => (el as HTMLImageElement).naturalWidth),
            )
            .toBe(160);
          await expect
            .poll(() =>
              frame
                .getByAltText("Remote fixture image")
                .evaluate((el) => (el as HTMLImageElement).naturalWidth),
            )
            .toBe(160);
          assert.ok(tracking.length > beforeImages);
          const refreshedImage = page.waitForResponse(
            (response) =>
              response.url() === origin + "/api/v1/email/attachments" &&
              response.status() === 200 &&
              Boolean(
                JSON.parse(response.request().postData() ?? "{}").attachmentId,
              ),
          );
          await page
            .getByRole("button", { name: "Refresh images", exact: true })
            .click();
          await refreshedImage;
          await expect
            .poll(() =>
              frame
                .getByAltText("Embedded fixture image")
                .evaluate((el) => (el as HTMLImageElement).naturalWidth),
            )
            .toBe(160);
          assert.equal(
            await page.evaluate(() => Object.hasOwn(window, "__emailUnsafe")),
            false,
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            "No horizontal page overflow",
          );
          await page.screenshot({
            path: join(evidence, `${viewport.name}-${theme}-rendered.png`),
          });
          await page
            .getByRole("region", { name: "Selected email" })
            .locator("iframe")
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: join(evidence, `${viewport.name}-${theme}-images.png`),
          });
          await page
            .getByRole("button", { name: "Close message", exact: true })
            .click();
          await page
            .getByRole("button", { name: /^Original message 1\b/ })
            .filter({ hasText: "Original sender" })
            .click();
          await expect(
            page.getByRole("button", { name: "Formatted", exact: true }),
          ).toBeDisabled();
          await expect(
            page.getByRole("button", { name: "Read more body", exact: true }),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Read more body", exact: true })
            .click();
          await expect(
            page.getByRole("button", { name: "Read more body", exact: true }),
          ).toBeEnabled();
          await page
            .getByRole("button", { name: "Read more body", exact: true })
            .click();
          await expect(
            page.getByRole("button", { name: "Read more body", exact: true }),
          ).toHaveCount(0);
          await expect(
            frame.getByText("Long formatted end.", { exact: true }),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Plain text", exact: true })
            .click();
          await expect(
            page
              .getByRole("region", { name: "Original message body" })
              .locator("pre"),
          ).toContainText("Long plain-text end.");
          await page
            .getByRole("button", { name: "Close message", exact: true })
            .click();
          await page.route(
            origin + "/api/v1/email/read",
            (route) =>
              route.fulfill({
                status: 503,
                contentType: "application/json",
                body: JSON.stringify({ code: "UNAVAILABLE" }),
              }),
            { times: 1 },
          );
          await page
            .getByRole("button", { name: /^Original message 2\b/ })
            .filter({ hasText: "Original sender" })
            .click();
          await expect(
            page.getByText(/Original message could not be loaded/),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Reload original", exact: true })
            .click();
          await expect(
            frame.getByRole("heading", { name: "HTML-only original" }),
          ).toBeVisible();
          await expect(
            page
              .getByRole("alert")
              .filter({ hasText: "Original mail is unavailable" }),
          ).toHaveCount(0);
          await expect(frame.locator("h1")).toHaveCSS(
            "color",
            "rgb(26, 80, 120)",
          );
          await expect(
            page.getByRole("button", { name: "Load images", exact: true }),
          ).toBeVisible();
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            "HTML-only mail does not overflow the page",
          );
          await page
            .getByRole("region", { name: "Selected email" })
            .locator("iframe")
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: join(evidence, `${viewport.name}-${theme}-html-only.png`),
          });
          await page
            .getByRole("button", { name: "Close message", exact: true })
            .click();
          await page.screenshot({
            path: join(evidence, `${viewport.name}-${theme}.png`),
            fullPage: true,
          });
          await page
            .getByRole("region", { name: "Email counts" })
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: join(evidence, `${viewport.name}-${theme}-viewport.png`),
          });
        }
      await page.goto(origin + "/app");
      await expect(
        page.getByRole("heading", { name: "Email", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "70 received", exact: true }),
      ).toBeVisible();
      const grant = await post<{ token: string }>(
        "/api/v1/foundation/clients",
        {
          name: "Email MCP fixture",
          projectId: project.id,
          operations: ["mail.read", "mail.triage", "mail.draft", "mail.send"],
          environment: "local",
          ttlSeconds: 3600,
        },
        201,
      );
      const client = new Client({ name: "email-fixture", version: "1" });
      clients.push(client);
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(origin + "/mcp/foundation/" + project.id),
          {
            requestInit: {
              headers: { Authorization: "Bearer " + grant.token },
            },
          },
        ),
      );
      const tools = await client.listTools();
      assert.equal(
        tools.tools.filter((t) => t.name.includes("mail")).length,
        10,
      );
      assert.ok(!tools.tools.some((t) => t.name.includes("approve_mail")));
      const overviewResult = await client.callTool({
        name: "get_mail_overview",
        arguments: {},
      });
      assert.equal(overviewResult.isError, undefined);
      assert.equal(
        (overviewResult.structuredContent as MailOverview).counts.received,
        70,
      );
      const found = await client.callTool({
        name: "search_mail",
        arguments: { q: "Urgent", limit: 2 },
      });
      const mail = found.structuredContent as MailPage<MailMessage>;
      assert.equal(mail.items.length, 2);
      assert.ok(mail.nextCursor);
      const read = await client.callTool({
        name: "read_mail",
        arguments: { id: mail.items[0]!.id },
      });
      assert.equal(read.isError, undefined);
      assert.equal(
        (read.structuredContent as { untrusted: boolean }).untrusted,
        true,
      );
      const triage = await client.callTool({
        name: "triage_mail",
        arguments: {
          id: mail.items[0]!.id,
          expectedVersion: mail.items[0]!.version,
          summary:
            "Original message " +
            mail.items[0]!.id +
            " reviewed by scoped fixture; unverified.",
        },
      });
      assert.equal(triage.isError, undefined);
      const draftResult = await client.callTool({
        name: "create_mail_draft",
        arguments: {
          key: randomUUID(),
          draft: {
            accountId: account.id,
            from: "hello@iyulabs.com",
            to: ["recipient@example.test"],
            subject: "MCP unapproved control",
            text: "Never send without approval",
          },
        },
      });
      const mcpDraft = draftResult.structuredContent as MailDraft;
      assert.ok(mcpDraft.id);
      const refused = await client.callTool({
        name: "send_mail_draft",
        arguments: { id: mcpDraft.id },
      });
      assert.equal(refused.isError, true);
      assert.equal(
        (refused.structuredContent as { code: string }).code,
        "APPROVAL_REQUIRED",
      );
      assert.deepEqual(errors, []);
      await writeFile(
        join(evidence, "result.json"),
        JSON.stringify(
          {
            desktopMobileThemes: 4,
            ownerJourney:
              "pagination, domains, actual address counts, original content and isolated HTML, attachments, local review, cross-domain multiple recipients, immutable edit invalidation, queued send and rules",
            mcp: "10 explicitly granted tools through real authenticated Streamable HTTP; originals, counts, triage, draft and approval denial",
            pageErrors: errors,
            blockedRemoteTracking: tracking.length,
            provider: "synthetic only",
            cleanup:
              "Disposable cluster, web, browser contexts and private fixture key removed by the harness",
          },
          null,
          2,
        ),
      );
      await context.tracing.stop({ path: join(evidence, "trace.zip") });
      await context.close();
    } finally {
      if (browser)
        for (const context of browser.contexts()) {
          const dir = resolve(
            root,
            process.env.COMMANDRY_EMAIL_ARTIFACTS ?? ".agent/email-browser",
          );
          await mkdir(dir, { recursive: true });
          await context.tracing
            .stop({ path: join(dir, "trace.zip") })
            .catch(() => {});
          for (const page of context.pages()) {
            await page
              .screenshot({ path: join(dir, "last-state.png"), fullPage: true })
              .catch(() => {});
            await writeFile(
              join(dir, "last-state.txt"),
              await page
                .locator("body")
                .innerText()
                .catch(() => "Page unavailable"),
            );
          }
        }
      for (const client of clients) await client.close();
      await browser?.close();
      if (web.exitCode === null) {
        web.kill("SIGTERM");
        await Promise.race([
          new Promise<void>((r) => web.once("exit", () => r())),
          delay(5000).then(() => {
            web.kill("SIGKILL");
          }),
        ]);
      }
      if (builtWorker && builtWorker.exitCode === null) {
        builtWorker.kill("SIGTERM");
        await Promise.race([
          new Promise<void>((r) => builtWorker!.once("exit", () => r())),
          delay(5000).then(() => {
            builtWorker?.kill("SIGKILL");
          }),
        ]);
      }
      await db.close();
      await rm(temp, { recursive: true, force: true });
    }
  },
);
