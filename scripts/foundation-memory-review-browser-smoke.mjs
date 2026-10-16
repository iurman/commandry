import assert from "node:assert/strict";
import { join } from "node:path";
import { expect } from "@playwright/test";

// Synthetic imported assertions and an actual disposable owner session only.
export async function foundationMemoryReviewBrowserSmoke({
  page,
  origin,
  trustedOrigin,
  environment,
  screenshots,
  reviewHrefs,
  project,
}) {
  assert.equal(reviewHrefs.length, 21);
  await page.goto(trustedOrigin + reviewHrefs[0]);
  const panel = page.getByRole("region", {
    name: "Memory assertion review",
    exact: true,
  });
  await expect(
    panel.getByLabel("Assertion statement", { exact: true }),
  ).toContainText("Synthetic browser assertion");
  await panel
    .getByText("Inspect source and all evidence IDs", { exact: true })
    .click();
  await expect(
    panel
      .getByRole("list", { name: "All evidence IDs", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(11);
  await expect(
    panel.getByRole("link", {
      name: "View current Knowledge source JSON",
      exact: true,
    }),
  ).toHaveAttribute("href", /^\/api\/v1\/knowledge-items\/[a-f0-9-]+$/);
  for (const colorScheme of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : 844,
      });
      await expect(
        panel.getByRole("combobox", { name: "Review decision", exact: true }),
      ).toBeEnabled();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `Owner memory review ${colorScheme}/${width} fits viewport`,
      );
      if (screenshots)
        await page.screenshot({
          animations: "disabled",
          fullPage: true,
          path: join(
            screenshots,
            `foundation-memory-review-${environment}-${colorScheme}-${width}.png`,
          ),
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const memoryId = new URL(reviewHrefs[0], trustedOrigin).pathname
    .split("/")
    .at(-1);
  const reviewPath = `/api/v1/foundation/memory/${memoryId}/review`;
  const pattern = "**" + reviewPath;
  const sent = [];
  await page.route(pattern, async (route) => {
    const request = route.request();
    sent.push({
      body: request.postData(),
      key: request.headers()["idempotency-key"],
    });
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
    if (sent.length === 1)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    else {
      assert.equal((await response.json()).replayed, true);
      await route.fulfill({ response });
    }
  });
  try {
    await panel
      .getByRole("combobox", { name: "Review decision", exact: true })
      .selectOption("accepted");
    await panel
      .getByRole("textbox", { name: "Review reason", exact: true })
      .fill(
        "Reviewed synthetic assertion and exact source; no instruction approval.",
      );
    await panel
      .getByRole("button", { name: "Save review decision", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Retry same decision", exact: true }),
    ).toBeEnabled();
    await expect(
      panel.getByRole("textbox", { name: "Review reason", exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("region", {
        name: "Confirmed review receipt",
        exact: true,
      }),
    ).toHaveCount(0);
    await panel
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(
      panel.getByRole("region", {
        name: "Confirmed review receipt",
        exact: true,
      }),
    ).toContainText("Original review receipt replayed.");
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0], sent[1]);
    assert.ok(sent[0].key);
    await panel
      .getByRole("button", { name: "Reload current state", exact: true })
      .click();
    await expect(
      panel.locator("dd").filter({ hasText: /^accepted$/ }),
    ).toBeVisible();
    await expect(
      panel.locator("dd").filter({ hasText: /^unverified$/ }),
    ).toBeVisible();
    const actual = await page.evaluate(
      async ({ path, projectId }) => {
        const r = await fetch(path + "?projectId=" + projectId, {
          credentials: "same-origin",
          cache: "no-store",
        });
        return { status: r.status, body: await r.json() };
      },
      { path: `/api/v1/foundation/memory/${memoryId}`, projectId: project.id },
    );
    assert.equal(actual.status, 200);
    assert.equal(actual.body.memory.lifecycle, "accepted");
    assert.equal(actual.body.memory.version, 1);
    assert.equal(actual.body.memory.verification, "unverified");
  } finally {
    await page.unroute(pattern);
  }
  await page.goto(trustedOrigin + reviewHrefs[1]);
  await expect(
    panel.getByLabel("Assertion statement", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Review decision", exact: true })
    .selectOption("rejected");
  await panel
    .getByRole("textbox", { name: "Review reason", exact: true })
    .fill("Synthetic owner rejection.");
  await panel
    .getByRole("button", { name: "Save review decision", exact: true })
    .click();
  await expect(
    panel.getByRole("region", {
      name: "Confirmed review receipt",
      exact: true,
    }),
  ).toContainText("rejected");
  console.log(
    `Owner assertion browser passed (${environment}): actual import links/read, all evidence IDs, six layouts, exact lost-response replay, canonical acceptance without factual verification, and rejection.`,
  );
  await page.goto(trustedOrigin + "/account");
}
