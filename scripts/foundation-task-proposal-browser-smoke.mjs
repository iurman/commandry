import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect } from "@playwright/test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

// The parent intercepts every browser request to the disposable loopback app.
export async function foundationTaskProposalBrowserSmoke({
  page,
  create,
  origin,
  trustedOrigin,
  project,
  environment,
  screenshots,
}) {
  const issued = await create("/api/v1/foundation/clients", {
    name: "Synthetic browser proposal writer",
    projectId: project.id,
    environment,
    operations: ["work.propose"],
    ttlSeconds: 3600,
  });
  const client = new Client({
    name: "proposal-browser-rehearsal",
    version: "1.0.0",
  });
  const reviewPath = "/api/v1/foundation/task-proposals/review";
  const reviewPattern = "**" + reviewPath;
  const sent = [];
  let withheld = false;
  let releaseRequest = () => {};
  let requestStarted = () => {};
  const observedRequest = new Promise((resolve) => {
    requestStarted = resolve;
  });
  const requestGate = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`${origin}/mcp/foundation/${project.id}`),
        {
          requestInit: { headers: { authorization: `Bearer ${issued.token}` } },
        },
      ),
    );
    async function propose(label) {
      const result = await client.callTool({
        name: "propose_task",
        arguments: {
          originalContent:
            `Synthetic browser ${label} <img src=x onerror=alert(1)>\r\n` +
            "long-unverified-source-".repeat(16),
          proposedTitle: `Synthetic browser ${label}`,
          proposedBody: "Suggested text only; no execution authority.",
          rationale: "Owner browser review rehearsal.",
          idempotencyKey: randomUUID(),
        },
      });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      return result.structuredContent.record;
    }
    const first = await propose("approve");
    const second = await propose("reject");
    const manual = await create("/api/v1/captures", {
      inputType: "text",
      originalContent: "Synthetic manual browser capture",
    });
    await page.goto(`${trustedOrigin}/inbox?captureId=${first.captureId}`);
    const panel = page.getByRole("region", {
      name: "Agent task proposal",
      exact: true,
    });
    await expect(
      panel.getByText("Pending review", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Capture suggestion", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "File record", exact: true }),
    ).toHaveCount(0);
    await panel
      .getByLabel("Task title", { exact: true })
      .fill("Browser owner selected task");
    await panel
      .getByLabel("Task body", { exact: true })
      .fill("Exact owner selection\nwith a second line.");
    for (const colorScheme of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme });
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(
          panel.getByRole("button", {
            name: "Approve and create task",
            exact: true,
          }),
        ).toBeEnabled();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
        if (screenshots)
          await page.screenshot({
            path: join(
              screenshots,
              `proposal-${environment}-${colorScheme}-${width}.png`,
            ),
            fullPage: true,
          });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route(reviewPattern, async (route) => {
      const request = route.request();
      sent.push({
        body: request.postData(),
        key: request.headers()["idempotency-key"],
      });
      if (sent.length === 1) {
        requestStarted();
        await requestGate;
      }
      const url = new URL(request.url());
      const response = await route.fetch({
        url: origin + reviewPath,
        maxRedirects: 0,
        headers: {
          ...(await request.allHeaders()),
          host: new URL(origin).host,
          "x-forwarded-host": url.host,
          "x-forwarded-proto": url.protocol.slice(0, -1),
        },
      });
      assert.equal(response.status(), 200, await response.text());
      if (!withheld) {
        withheld = true;
        // The real transaction commits, but its receipt is withheld in transit.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
      } else {
        const receipt = await response.json();
        assert.equal(receipt.replayed, true);
        await route.fulfill({ response });
      }
    });
    await panel
      .getByRole("button", { name: "Approve and create task", exact: true })
      .click();
    await observedRequest;
    const ledger = page.getByRole("list", {
      name: "Captured items",
      exact: true,
    });
    await ledger
      .getByRole("button")
      .filter({ hasText: "Synthetic manual browser capture" })
      .click();
    await expect(panel).toHaveCount(0);
    await expect(
      page.getByText(`Capture ID ${manual.id}`, { exact: true }),
    ).toBeVisible();
    await ledger
      .getByRole("button")
      .filter({ hasText: "Synthetic browser approve" })
      .click();
    await expect(
      panel.getByText("Pending review", { exact: true }),
    ).toBeVisible();
    releaseRequest();
    await expect(
      panel.getByRole("button", { name: "Retry same decision", exact: true }),
    ).toBeEnabled();
    await panel
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(panel.getByText("Approved", { exact: true })).toBeVisible();
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0], sent[1]);
    await page.unroute(reviewPattern);
    await page.goto(`${trustedOrigin}/inbox?captureId=${second.captureId}`);
    await expect(
      panel.getByText("Pending review", { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Reject proposal", exact: true })
      .click();
    await expect(panel.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(
      panel.getByText("The original capture is retained.", { exact: true }),
    ).toBeVisible();
    console.log(
      `Task proposal owner browser passed (${environment}): exact source, six visual states, actual approval, withheld receipt, selection-safe same-key replay and rejection.`,
    );
  } finally {
    releaseRequest();
    await page.unroute(reviewPattern);
    await client.close();
    await create(
      `/api/v1/foundation/clients/${issued.client.id}/revoke`,
      {},
      200,
    );
    await page.goto(trustedOrigin + "/account");
  }
}
