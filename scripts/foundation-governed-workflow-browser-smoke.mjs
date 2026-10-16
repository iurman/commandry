import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect } from "@playwright/test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  createGovernedFindingFixture,
  createGovernedImprovementFixture,
  governedOnboardingInput,
} from "./foundation-governed-workflow-smoke.mjs";

// The parent owns authentication and fulfills every page request from loopback.
export async function foundationGovernedWorkflowBrowserSmoke({
  page,
  create,
  origin,
  trustedOrigin,
  project,
  environment,
  screenshots,
}) {
  const issued = await create("/api/v1/foundation/clients", {
    name: "Synthetic browser governed workflow fixture",
    projectId: project.id,
    environment,
    operations: [
      "foundation.read",
      "evidence.record",
      "configuration.record",
      "evaluation.record",
      "finding.propose",
      "finding.read",
      "onboarding.propose",
      "onboarding.read",
      "improvement.propose",
      "improvement.read",
    ],
    ttlSeconds: 3600,
  });
  const client = new Client({
    name: "governed-browser-rehearsal",
    version: "1.0.0",
  });
  const reviewPath = "/api/v1/foundation/workflows/findings/review";
  const reviewPattern = "**" + reviewPath;
  const sent = [];
  const receipts = [];
  let releaseRequest = () => {};
  let requestStarted = () => {};
  const observedRequest = new Promise((resolve) => {
    requestStarted = resolve;
  });
  const requestGate = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  const call = async (target, name, args = {}) => {
    const result = await target.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(
      JSON.parse(result.content[0].text),
      result.structuredContent,
    );
    return result.structuredContent;
  };
  async function visual(label, control) {
    for (const colorScheme of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(control).toBeVisible();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
          true,
          `${label} ${colorScheme}/${width} fits horizontally`,
        );
        assert.equal((await page.content()).includes(issued.token), false);
        if (screenshots)
          await page.screenshot({
            path: join(
              screenshots,
              `governed-${label}-${environment}-${colorScheme}-${width}.png`,
            ),
            fullPage: true,
          });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`${origin}/mcp/foundation/${project.id}`),
        {
          requestInit: { headers: { authorization: `Bearer ${issued.token}` } },
        },
      ),
    );
    const fixture = await createGovernedFindingFixture({
      client,
      call,
      write: create,
      project,
    });
    const originals = new Map();
    async function propose(label) {
      const originalContent =
        `Synthetic browser finding ${label} <img src=x onerror=alert(1)>\r\n` +
        "long-unverified-source-".repeat(16);
      const submitted = (
        await call(client, "propose_finding", {
          originalContent,
          proposedTitle: `Synthetic browser finding ${label}`,
          proposedBody:
            "Cited, unverified suggestion only; no instruction authority.",
          rationale: "Owner browser finding review rehearsal.",
          citations: [fixture.citation],
          idempotencyKey: randomUUID(),
        })
      ).record;
      originals.set(submitted.captureId, originalContent);
      return submitted;
    }
    const first = await propose("approve");
    const second = await propose("reject");
    const manual = await create("/api/v1/captures", {
      inputType: "text",
      originalContent: "Synthetic governed browser manual capture",
    });
    await page.goto(`${trustedOrigin}/inbox?captureId=${first.captureId}`);
    const panel = page.getByRole("region", {
      name: "Agent finding proposal",
      exact: true,
    });
    await expect(
      panel.getByText("Pending review", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Agent task proposal", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Capture suggestion", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "File this capture", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^File as / })).toHaveCount(
      0,
    );
    assert.equal(
      await page
        .getByRole("article", { name: "Original input", exact: true })
        .locator("pre")
        .textContent(),
      originals.get(first.captureId),
    );
    await expect(
      page
        .getByRole("article", { name: "Original input", exact: true })
        .locator("img"),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("heading", {
        name: "Whole-source citations",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByText(`Evidence: ${fixture.evidence.id}`, { exact: true }),
    ).toBeVisible();
    await panel
      .getByLabel("Finding title", { exact: true })
      .fill("Browser owner selected finding");
    await panel
      .getByLabel("Finding body", { exact: true })
      .fill("Exact owner-selected finding.\nThis remains unverified.");
    await panel
      .getByLabel("Review reason", { exact: true })
      .fill(
        "Reviewed original and citation identities, not factual verification.",
      );
    const approve = panel.getByRole("button", {
      name: "Approve and file finding",
      exact: true,
    });
    await visual("finding-pending", approve);
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
      receipts.push(await response.json());
      assert.equal(receipts.at(-1).replayed, sent.length !== 1);
      if (sent.length === 1) {
        // Commit the actual transaction, then truncate only its delivery receipt.
        await route.fulfill({ response, body: "" });
      } else {
        assert.equal(receipts[1].replayed, true);
        await route.fulfill({ response });
      }
    });
    await approve.focus();
    await expect(approve).toBeFocused();
    await approve.press("Enter");
    await observedRequest;
    const ledger = page.getByRole("list", {
      name: "Captured items",
      exact: true,
    });
    await ledger
      .getByRole("button")
      .filter({ hasText: "Synthetic governed browser manual capture" })
      .click();
    await expect(panel).toHaveCount(0);
    await expect(
      page.getByText(`Capture ID ${manual.id}`, { exact: true }),
    ).toBeVisible();
    await ledger
      .getByRole("button")
      .filter({ hasText: "Synthetic browser finding approve" })
      .click();
    await expect(
      panel.getByText("Pending review", { exact: true }),
    ).toBeVisible();
    releaseRequest();
    const retry = panel.getByRole("button", {
      name: "Retry same decision",
      exact: true,
    });
    await expect(retry).toBeEnabled();
    await retry.focus();
    await retry.press("Enter");
    await expect(panel.getByText("Approved", { exact: true })).toBeVisible();
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0], sent[1]);
    assert.deepEqual(receipts[1].record, receipts[0].record);
    assert.equal(receipts[1].correlationId, receipts[0].correlationId);
    assert.equal(receipts[0].record.memory.lifecycle, "proposed");
    assert.equal(receipts[0].record.memory.verification, "unverified");
    const filed = await call(client, "get_finding", { id: first.proposalId });
    assert.equal(filed.capture.originalContent, originals.get(first.captureId));
    assert.equal(filed.capture.filedRecord.id, receipts[0].record.knowledge.id);
    await expect(
      panel.getByRole("link", { name: "View project knowledge", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("link", {
        name: "Review the proposed assertion",
        exact: true,
      }),
    ).toBeVisible();
    await page.unroute(reviewPattern);
    await page.goto(`${trustedOrigin}/inbox?captureId=${second.captureId}`);
    await expect(
      panel.getByText("Pending review", { exact: true }),
    ).toBeVisible();
    await panel
      .getByLabel("Review reason", { exact: true })
      .fill("Reject this interpretation while preserving its original source.");
    const reject = panel.getByRole("button", {
      name: "Reject proposal",
      exact: true,
    });
    await reject.focus();
    await reject.press("Enter");
    await expect(panel.getByText("Rejected", { exact: true })).toBeVisible();
    assert.equal(
      (await call(client, "get_finding", { id: second.proposalId })).capture
        .state,
      "unfiled",
    );

    const onboarding = (
      await call(client, "propose_host_onboarding", {
        ...governedOnboardingInput(fixture.evidence.id, "browser"),
        idempotencyKey: randomUUID(),
      })
    ).record;
    await page.goto(
      `${trustedOrigin}/foundation/workflows?projectId=${project.id}`,
    );
    const workflows = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Agent proposals",
          exact: true,
        }),
      })
      .first();
    await expect(workflows.getByLabel("Project", { exact: true })).toHaveValue(
      project.id,
    );
    await workflows
      .getByLabel("Workflow", { exact: true })
      .selectOption("onboarding");
    await workflows
      .getByRole("button")
      .filter({ hasText: onboarding.rationale })
      .click();
    await expect(
      workflows.getByRole("heading", {
        name: "Review host inventory changes",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      workflows.getByText("Current inventory preview is eligible.", {
        exact: true,
      }),
    ).toBeVisible();
    const inventoryApprove = workflows.getByRole("button", {
      name: "Approve inventory changes",
      exact: true,
    });
    await expect(inventoryApprove).toBeDisabled();
    await workflows
      .getByLabel("Review reason", { exact: true })
      .fill(
        "Owner inspected this synthetic exact host identity and proposed connection.",
      );
    await expect(inventoryApprove).toBeDisabled();
    const acknowledgement = workflows.getByRole("checkbox", {
      name: "I inspected this host identity, existing inventory and proposed project connection.",
      exact: true,
    });
    await acknowledgement.focus();
    await acknowledgement.press("Space");
    await expect(acknowledgement).toBeChecked();
    await expect(inventoryApprove).toBeEnabled();
    await visual("onboarding-preview", inventoryApprove);
    await inventoryApprove.focus();
    await inventoryApprove.press("Enter");
    await expect(
      workflows.getByText(
        "Owner decision recorded. Apply remains a separate operation.",
        { exact: true },
      ),
    ).toBeVisible();
    const approvedInventory = await call(client, "get_host_onboarding", {
      id: onboarding.id,
    });
    assert.equal(approvedInventory.currentDecision.decision, "approved");
    assert.equal(approvedInventory.outcome, null);
    const apply = workflows.getByRole("button", {
      name: "Apply approved inventory changes",
      exact: true,
    });
    await expect(apply).toBeEnabled();
    await apply.focus();
    await apply.press("Enter");
    await expect(
      workflows.getByRole("link", {
        name: "View project infrastructure",
        exact: true,
      }),
    ).toBeVisible();
    const applied = await call(client, "get_host_onboarding", {
      id: onboarding.id,
    });
    assert.ok(applied.outcome.resourceId);
    await expect(
      workflows.getByText(
        new RegExp(
          `Previously applied at .*Resource: ${applied.outcome.resourceId}`,
        ),
      ),
    ).toBeVisible();
    await expect(apply).toHaveCount(0);
    await visual(
      "onboarding-applied",
      workflows.getByRole("link", {
        name: "View project infrastructure",
        exact: true,
      }),
    );

    const improvementFixture = await createGovernedImprovementFixture({
      client,
      call,
      write: create,
      project,
    });
    const improvement = (
      await call(client, "propose_improvement", {
        ...improvementFixture.proposalInput,
        idempotencyKey: randomUUID(),
      })
    ).record;
    await workflows
      .getByLabel("Workflow", { exact: true })
      .selectOption("improvements");
    await workflows
      .getByRole("button")
      .filter({ hasText: improvement.rationale })
      .click();
    await expect(
      workflows.getByRole("heading", {
        name: "Review a configuration comparison",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      workflows.getByText("Current regression is blocked.", { exact: true }),
    ).toBeVisible();
    await workflows
      .getByLabel("Review reason", { exact: true })
      .fill(
        "Owner reviewed the complete deterministic synthetic comparison. No adoption.",
      );
    const accept = workflows.getByRole("button", {
      name: "Accept comparison",
      exact: true,
    });
    await expect(accept).toBeDisabled();
    for (const assessment of improvementFixture.assessments)
      await improvementFixture.review(assessment);
    await workflows
      .getByRole("button", { name: "Reload current view", exact: true })
      .click();
    await expect(
      workflows.getByText("Current regression is eligible for owner review.", {
        exact: true,
      }),
    ).toBeVisible();
    await workflows
      .getByLabel("Review reason", { exact: true })
      .fill(
        "Owner reviewed every synthetic comparison cell. Configuration adoption remains separate.",
      );
    await expect(accept).toBeEnabled();
    await visual("improvement-reviewed", accept);
    await accept.focus();
    await accept.press("Enter");
    await expect(
      workflows.getByText(
        "Owner decision recorded. Configuration adoption remains a separate operation.",
        { exact: true },
      ),
    ).toBeVisible();
    assert.equal(
      (await call(client, "get_improvement", { id: improvement.id }))
        .currentDecision.decision,
      "accepted",
    );
    assert.equal(
      (
        await call(client, "get_configuration_version", {
          id: improvementFixture.candidate.id,
        })
      ).contentDigest,
      improvementFixture.candidate.contentDigest,
    );
    assert.equal(
      await page.evaluate(
        (token) =>
          JSON.stringify({ ...localStorage, ...sessionStorage }).includes(
            token,
          ),
        issued.token,
      ),
      false,
    );
    assert.equal(new URL(page.url()).searchParams.has("token"), false);
    console.log(
      `Governed owner browser rehearsal passed (${environment}): finding Inbox routing, escaped originals, exact private-key/body retry after a lost real receipt, one canonical filing and rejection; onboarding acknowledgement/review/separate apply; blocked and complete synthetic comparisons; keyboard actions and dark/light 1440/390/320 layouts. No inference, verification or adoption claimed.`,
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
