import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { foundationMemoryReviewBrowserSmoke } from "./foundation-memory-review-browser-smoke.mjs";

// Reuses the Account page, owner persona and loopback-only browser routing.
// Every record below is synthetic; this never loads the owner's exports.
export async function foundationImportBrowserSmoke({
  page,
  create,
  origin,
  trustedOrigin,
  project,
  environment,
  screenshots,
  client,
}) {
  console.log(`Selected-import browser fixture setup (${environment}).`);
  const source = "Synthetic browser import source, retained as Knowledge.";
  const capture = await create("/api/v1/captures", {
    inputType: "text",
    originalContent: source,
  });
  const knowledge = (
    await create(`/api/v1/captures/${capture.id}/file`, {
      projectId: project.id,
      kind: "note",
      title: "Synthetic browser import anchor",
      body: source,
    })
  ).record;
  const namespace = `browser-selected-${randomUUID()}`;
  const original =
    "\ufeffSynthetic <img src=x onerror=alert(1)>\r\nCaf\u00e9\u0000" +
    "long-original-".repeat(24);
  const envelope = {
    schemaVersion: 1,
    projectId: project.id,
    namespace,
    records: Array.from({ length: 21 }, (_, index) => ({
      externalId: `browser-memory-${index + 1}`,
      knowledgeItemId: knowledge.id,
      statement: `Synthetic browser assertion ${index + 1}; requires separate approval.`,
      category: "preference",
      sourceTier: ["public", "private", "client", "unknown"][index % 4],
      selected: true,
      sources: Array.from({ length: index === 0 ? 11 : 1 }, (_, ordinal) => {
        const originalContent =
          ordinal === 0
            ? source
            : ordinal === 1
              ? original
              : `Synthetic source ${ordinal}`;
        return {
          evidence: {
            projectId: project.id,
            sourceKind: ordinal === 0 ? "knowledge_revision" : "external",
            sourceId:
              ordinal === 0 ? knowledge.id : `${namespace}/${index}/${ordinal}`,
            sourceVersion: "1",
            contentDigest: createHash("sha256")
              .update(originalContent, "utf8")
              .digest("hex"),
            locator:
              ordinal === 0
                ? `commandry:knowledge/${knowledge.id}/versions/1`
                : `closed-export:browser/${index}/${ordinal}`,
            observedAt: "2026-10-15T12:34:56.123456+01:30",
            availability: "available",
          },
          originalContent,
        };
      }),
    })),
  };
  const panel = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Selected memory import",
        exact: true,
      }),
    })
    .first();
  const file = panel.getByLabel("Closed export JSON file", { exact: true });
  await expect(file).toBeEnabled();
  const submitted = [];
  const observe = (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/foundation/imports/apply"
    )
      submitted.push({
        key: request.headers()["idempotency-key"],
        body: request.postDataJSON(),
      });
  };
  page.on("request", observe);
  let phase = "file and preview";
  const watchdog = setTimeout(() => {
    console.error(`Selected-import browser timed out during ${phase}.`);
    void page.close();
  }, 60_000);
  watchdog.unref();
  try {
    await file.setInputFiles({
      name: "synthetic-selected-export.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(envelope), "utf8"),
    });
    console.log(`Selected-import browser file loaded (${environment}).`);
    await panel
      .getByRole("button", { name: "Preview selected import", exact: true })
      .click();
    await expect(
      panel.getByRole("heading", {
        name: "Review destination: " + project.name,
        exact: true,
      }),
    ).toBeVisible();
    const records = panel.getByRole("list", {
      name: "Import records",
      exact: true,
    });
    console.log(`Selected-import browser preview bound (${environment}).`);
    await expect(records.locator(":scope > li")).toHaveCount(20);
    const checks = records.getByRole("checkbox");
    assert.equal(await checks.count(), 20);
    for (const check of await checks.all())
      await expect(check).not.toBeChecked();
    await expect(
      panel.getByRole("button", {
        name: "Confirm reviewed selection",
        exact: true,
      }),
    ).toBeDisabled();
    const details = records.locator("details").first();
    await details.locator("summary").click();
    await expect(
      details.getByLabel("Original JSON browser-memory-1 source 2", {
        exact: true,
      }),
    ).toHaveText(JSON.stringify(original));
    await expect(details.locator("img")).toHaveCount(0);
    await details
      .getByRole("button", {
        name: "Next sources for browser-memory-1",
        exact: true,
      })
      .click();
    await expect(
      details.getByLabel("Original JSON browser-memory-1 source 11", {
        exact: true,
      }),
    ).toHaveText(JSON.stringify("Synthetic source 10"));
    await expect(
      details.getByRole("button", {
        name: "Next sources for browser-memory-1",
        exact: true,
      }),
    ).toBeDisabled();
    await details
      .getByRole("button", {
        name: "Previous sources for browser-memory-1",
        exact: true,
      })
      .click();
    for (const colorScheme of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 844,
        });
        await file.scrollIntoViewIfNeeded();
        await expect(file).toBeVisible();
        const overflow = await page.evaluate(() => ({
          width: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll("body *")]
            .flatMap((element) => {
              const rect = element.getBoundingClientRect();
              return rect.right > window.innerWidth + 1 && rect.width > 0
                ? [
                    {
                      tag: element.tagName,
                      className: element.className,
                      width: rect.width,
                      right: rect.right,
                    },
                  ]
                : [];
            })
            .slice(0, 12),
        }));
        assert.ok(
          overflow.scrollWidth <= width + 1,
          `Import review ${colorScheme}/${width} fits viewport: ${JSON.stringify(overflow)}`,
        );
        if (screenshots)
          await page.screenshot({
            timeout: 10_000,
            animations: "disabled",
            path: join(
              screenshots,
              `foundation-import-${environment}-${colorScheme}-${width}.png`,
            ),
          });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    console.log(
      `Selected-import browser layout matrix passed (${environment}).`,
    );
    phase = "closing original inspection";
    await details.locator("summary").click();
    let reviewIndex = 0;
    for (const check of await checks.all()) {
      phase = `reviewing first-page selection ${++reviewIndex}`;
      await check.check({ timeout: 5_000 });
    }
    console.log(
      `Selected-import browser first review page checked (${environment}).`,
    );
    await panel
      .getByRole("button", { name: "Next records", exact: true })
      .click();
    await expect(records.locator(":scope > li")).toHaveCount(1);
    await records
      .getByRole("checkbox", {
        name: "Review exact selection browser-memory-21",
        exact: true,
      })
      .check();
    await panel
      .getByRole("button", { name: "Confirm reviewed selection", exact: true })
      .click();
    const confirmation = panel.getByRole("group", {
      name: "Confirm selected memory import",
      exact: true,
    });
    await expect(confirmation).toContainText(project.id);
    await expect(confirmation).toContainText(environment);
    await expect(confirmation).toContainText(namespace);
    await panel
      .getByRole("button", { name: "Cancel import", exact: true })
      .click();
    assert.equal(submitted.length, 0, "Cancel causes no apply request");
    console.log(
      `Selected-import browser confirmation canceled (${environment}).`,
    );
    await panel
      .getByRole("button", { name: "Confirm reviewed selection", exact: true })
      .click();
    let delivered;
    phase = "applying the exact reviewed decision";
    try {
      [delivered] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              "/api/v1/foundation/imports/apply" &&
            response.request().method() === "POST",
          { timeout: 10_000 },
        ),
        panel
          .getByRole("button", { name: "Import as proposals", exact: true })
          .click(),
      ]);
    } catch {
      throw new Error(
        `No browser apply response: ${(await panel.getByRole("alert").allTextContents()).join("; ")}`,
      );
    }
    const deliveredBody = await delivered.json();
    console.log(
      `Selected-import browser apply delivered (${environment}, ${delivered.status()}).`,
    );
    assert.equal(
      delivered.status(),
      200,
      `Browser import response ${deliveredBody.code ?? "without safe code"}`,
    );
    assert.equal(
      await panel.getByRole("alert").count(),
      0,
      `Browser import UI: ${(await panel.getByRole("alert").allTextContents()).join("; ")}`,
    );
    await expect(
      panel.getByRole("heading", { name: "Import confirmed", exact: true }),
    ).toBeVisible();
    assert.equal(submitted.length, 1);
    assert.ok(submitted[0].key);
    assert.equal(submitted[0].body.reviewedSelections.length, 21);
    assert.deepEqual(submitted[0].body.envelope, envelope);
    assert.equal(await file.inputValue(), "");
    await expect(
      panel.getByRole("list", { name: "Import records", exact: true }),
    ).toHaveCount(0);
    assert.equal((await page.content()).includes("long-original-"), false);
    assert.equal(
      await page.evaluate(
        (marker) =>
          JSON.stringify({ ...localStorage, ...sessionStorage }).includes(
            marker,
          ),
        namespace,
      ),
      false,
    );
    const receipt = panel.getByRole("region", {
      name: "Import receipt",
      exact: true,
    });
    const reviewLinks = receipt.getByRole("link", {
      name: "Review assertion",
      exact: true,
    });
    await expect(reviewLinks).toHaveCount(21);
    const reviewHrefs = await reviewLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    const links = receipt.getByRole("link", { name: /^Import revision / });
    await expect(links).toHaveCount(21);
    const response = await page.evaluate(
      async (href) => {
        const result = await fetch(href, {
          credentials: "same-origin",
          cache: "no-store",
        });
        return { status: result.status, body: await result.json() };
      },
      await links.first().getAttribute("href"),
    );
    assert.equal(response.status, 200);
    const revision = response.body;
    assert.equal(revision.projectId, project.id);
    assert.equal(revision.alias.namespace, namespace);
    phase = "checking canonical MCP identity";
    const memory = await client.callTool({
      name: "get_memory_assertion",
      arguments: { id: revision.memoryId },
    });
    assert.notEqual(memory.isError, true);
    assert.equal(memory.structuredContent.memory.lifecycle, "proposed");
    assert.equal(memory.structuredContent.memory.verification, "unverified");
    assert.equal(memory.structuredContent.memory.knowledgeItemId, knowledge.id);
    phase = "owner memory review";
    // The import watchdog covers its own flow, not the separate owner review.
    clearTimeout(watchdog);
    await foundationMemoryReviewBrowserSmoke({
      page,
      origin,
      trustedOrigin,
      environment,
      screenshots,
      reviewHrefs,
      project,
    });
    console.log(
      `Foundation selected-import browser rehearsal passed (${environment}): actual 21-record/all-tier review, complete record/source pagination, safe originals, cancel, canonical import/MCP identity and private-input clearing; dark/light at1440/390/320px on reused Account page.`,
    );
  } catch (error) {
    console.error(
      "Selected-import browser failure state",
      JSON.stringify({
        phase,
        applyRequests: submitted.length,
        alerts: await panel
          .getByRole("alert")
          .allTextContents()
          .catch(() => []),
        statuses: await panel
          .getByRole("status")
          .allTextContents()
          .catch(() => []),
      }),
    );
    if (screenshots)
      await page
        .screenshot({
          timeout: 10_000,
          path: join(
            screenshots,
            `foundation-import-${environment}-failure.png`,
          ),
        })
        .catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(watchdog);
    page.off("request", observe);
  }
}
