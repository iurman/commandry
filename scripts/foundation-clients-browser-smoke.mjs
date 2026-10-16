import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

// Opt-in browser checks against the disposable authentication rehearsal only.
// Production-mode URLs are intercepted and fulfilled exclusively from loopback.
export async function foundationClientsBrowserSmoke(
  origin,
  cookie,
  trustedOrigin,
  environment,
) {
  const headers = {
    cookie,
    origin: trustedOrigin,
    "content-type": "application/json",
  };
  async function create(path, body) {
    const response = await fetch(origin + path, {
      method: "POST",
      headers: { ...headers, "idempotency-key": randomUUID() },
      body: JSON.stringify(body),
    });
    assert.equal(
      response.status,
      201,
      "Disposable browser fixture must be created",
    );
    return response.json();
  }
  for (let index = 0; index < 26; index++) {
    await create("/api/v1/projects", {
      name: `Browser pagination project ${index}`,
      type: "software",
    });
  }
  const first = await fetch(origin + "/api/v1/projects?limit=25", {
    headers,
  }).then((response) => response.json());
  assert.ok(first.nextCursor);
  const second = await fetch(
    origin +
      "/api/v1/projects?limit=25&cursor=" +
      encodeURIComponent(first.nextCursor),
    { headers },
  ).then((response) => response.json());
  const project = second.items[0];
  assert.ok(project);
  const fixtureIds = [];
  for (let index = 0; index < 26; index++) {
    const issued = await create("/api/v1/foundation/clients", {
      name: `Browser metadata client ${index}`,
      projectId: project.id,
      environment,
      operations: ["foundation.read"],
      ttlSeconds: 3600,
    });
    fixtureIds.push(issued.client.id);
  }
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const screenshots = process.env.COMMANDRY_FOUNDATION_BROWSER_ARTIFACTS;
  if (screenshots) await mkdir(screenshots, { recursive: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "dark",
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: trustedOrigin,
    });
    const equal = cookie.indexOf("=");
    await context.addCookies([
      {
        name: cookie.slice(0, equal),
        value: cookie.slice(equal + 1),
        url: trustedOrigin,
        httpOnly: true,
        secure: trustedOrigin.startsWith("https:"),
        sameSite: "Lax",
      },
    ]);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== trustedOrigin) return route.abort("blockedbyclient");
      const requestHeaders = await route.request().allHeaders();
      const response = await route.fetch({
        url: origin + url.pathname + url.search,
        maxRedirects: 0,
        headers: {
          ...requestHeaders,
          host: new URL(origin).host,
          "x-forwarded-host": url.host,
          "x-forwarded-proto": url.protocol.slice(0, -1),
        },
      });
      await route.fulfill({ response });
    });
    const page = await context.newPage();
    page.on("pageerror", () => errors.push("uncaught browser error"));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push("browser console error");
    });
    const clientQueries = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() === "GET" &&
        url.pathname === "/api/v1/foundation/clients"
      )
        clientQueries.push(url.searchParams);
    });
    await page.goto(trustedOrigin + "/account");
    const panel = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Foundation clients",
          exact: true,
        }),
      })
      .first();
    await expect(panel.getByLabel("Project", { exact: true })).toBeEnabled();
    await expect(
      panel
        .getByLabel("Project", { exact: true })
        .locator(`option[value="${project.id}"]`),
    ).toHaveCount(0);
    await panel
      .getByRole("button", { name: "Load more projects", exact: true })
      .click();
    await expect(
      panel
        .getByLabel("Project", { exact: true })
        .locator(`option[value="${project.id}"]`),
    ).toHaveCount(1);
    await panel.getByLabel("Project", { exact: true }).selectOption(project.id);
    const list = panel.getByRole("list", {
      name: "Foundation clients",
      exact: true,
    });
    await expect(list.locator(":scope > li")).toHaveCount(25);
    await panel
      .getByRole("button", { name: "Load more clients", exact: true })
      .click();
    await expect(list.locator(":scope > li")).toHaveCount(26);
    const continuation = clientQueries.find((query) => query.has("after"));
    assert.ok(continuation?.get("asOf"));
    assert.equal(continuation.get("projectId"), project.id);
    await expect(
      panel.getByRole("checkbox", { name: "foundation.read", exact: true }),
    ).toBeChecked();
    for (const operation of [
      "evidence.record",
      "memory.propose",
      "memory.revise",
      "configuration.record",
      "evaluation.record",
    ]) {
      await expect(
        panel.getByRole("checkbox", { name: operation, exact: true }),
      ).not.toBeChecked();
    }
    const name = "Browser owner-issued scoped client";
    await panel.getByLabel("Client name", { exact: true }).fill(name);
    await panel.getByLabel("Lifetime", { exact: true }).selectOption("3600");
    await panel
      .getByRole("button", { name: "Create client", exact: true })
      .click();
    const credential = panel.getByLabel("One-time credential", { exact: true });
    await expect(credential).toBeVisible();
    const token = await credential.inputValue();
    assert.ok(
      /^af_[A-Za-z0-9_-]{43}$/.test(token),
      "Credential has the one-time token format",
    );
    assert.equal(new URL(page.url()).search, "");
    assert.equal(
      await page
        .evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
        .then((value) => value.includes(token)),
      false,
    );
    const mcp = new Client({
      name: "commandry-owner-panel-browser",
      version: "1.0.0",
    });
    try {
      await mcp.connect(
        new StreamableHTTPClientTransport(
          new URL(`${origin}/mcp/foundation/${project.id}`),
          {
            requestInit: { headers: { authorization: `Bearer ${token}` } },
          },
        ),
      );
      const tools = (await mcp.listTools()).tools;
      assert.ok(tools.length > 0);
      assert.equal(
        tools.some((tool) => /^(record_|propose_|revise_)/.test(tool.name)),
        false,
      );
      await panel
        .getByRole("button", { name: "Copy credential", exact: true })
        .click();
      await expect(
        panel.getByText("Credential copied.", { exact: true }),
      ).toBeVisible();
      assert.ok(
        (await page.evaluate(() => navigator.clipboard.readText())) === token,
        "Explicit copy uses the browser clipboard",
      );
      await page.evaluate(() => navigator.clipboard.writeText(""));
      await panel
        .getByRole("button", { name: "Dismiss credential", exact: true })
        .click();
      await expect(credential).toHaveCount(0);
      assert.equal((await page.content()).includes(token), false);
      await panel
        .getByRole("button", { name: "Refresh clients", exact: true })
        .click();
      await expect(
        panel.getByText("Loading clients...", { exact: true }),
      ).toHaveCount(0);
      while (
        await panel
          .getByRole("button", { name: "Load more clients", exact: true })
          .count()
      ) {
        const more = panel.getByRole("button", {
          name: "Load more clients",
          exact: true,
        });
        await expect(more).toBeEnabled();
        await more.click();
        await expect(
          panel.getByText("Loading clients...", { exact: true }),
        ).toHaveCount(0);
      }
      const card = list
        .locator(":scope > li")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
      await expect(card).toHaveCount(1);
      const revoke = card.getByRole("button", {
        name: "Revoke " + name,
        exact: true,
      });
      await revoke.click();
      await expect(
        card.getByRole("button", { name: "Confirm revoke", exact: true }),
      ).toBeFocused();
      await card.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(revoke).toBeFocused();
      assert.equal((await mcp.listTools()).tools.length, tools.length);
      await revoke.click();
      await card
        .getByRole("button", { name: "Confirm revoke", exact: true })
        .click();
      await expect(
        card.getByText("Revoked", { exact: true }).first(),
      ).toBeVisible();
      await assert.rejects(mcp.listTools());
    } finally {
      await mcp.close();
    }
    const form = panel.locator("form");
    for (const colorScheme of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 844,
        });
        await form.scrollIntoViewIfNeeded();
        await expect(
          panel.getByLabel("Client name", { exact: true }),
        ).toBeVisible();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
          `${colorScheme}/${width} has no horizontal overflow`,
        );
        if (screenshots)
          await page.screenshot({
            path: join(
              screenshots,
              `foundation-clients-${environment}-${colorScheme}-${width}.png`,
            ),
          });
      }
    }
    assert.equal(
      errors.length,
      0,
      "Owner panel has no browser console or uncaught errors",
    );
    await context.close();
    console.log(
      `Foundation owner-client browser rehearsal passed (${environment}): actual password session, project/client pagination, read-only default, one-time copy/dismiss, named cancel/revoke, real MCP revocation, dark/light at1440/390/320px; all network fulfilled from loopback.`,
    );
  } finally {
    await browser.close();
    for (const id of fixtureIds)
      await fetch(`${origin}/api/v1/foundation/clients/${id}/revoke`, {
        method: "POST",
        headers,
      });
  }
}
