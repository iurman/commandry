import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("filing one capture cannot replace another capture's form", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const token = randomUUID().replaceAll("-", "").slice(0, 10);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Inbox race ${token}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = (await projectResponse.json()) as { id: string };

  const originalA = `Capture A ${token}: preserve this source.`;
  const originalB = `Capture B ${token}: keep this detail visible.`;
  const captureResponseA = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: originalA },
  });
  const captureResponseB = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: originalB },
  });
  expect(captureResponseA.status()).toBe(201);
  expect(captureResponseB.status()).toBe(201);
  const captureA = (await captureResponseA.json()) as { id: string };
  const captureB = (await captureResponseB.json()) as { id: string };

  let signalDeferredPost: () => void = () => {};
  let releasePost: () => void = () => {};
  const deferredPost = new Promise<void>((resolve) => {
    signalDeferredPost = resolve;
  });
  const postGate = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  await page.route(`**/api/v1/captures/${captureA.id}/file`, async (route) => {
    if (route.request().method() === "POST") {
      signalDeferredPost();
      await postGate;
    }
    await route.continue();
  });

  try {
    await page.goto(`/inbox?captureId=${captureA.id}`);
    const source = page.getByRole("article", { name: "Original input" });
    await expect(source.locator("pre")).toHaveText(originalA);

    const projectSelect = page.getByLabel("Project *");
    const projectOption = projectSelect.locator(
      `option[value="${project.id}"]`,
    );
    await expect(projectSelect).toBeEnabled();
    while ((await projectOption.count()) === 0) {
      const previousCount = await projectSelect.locator("option").count();
      const more = page.getByRole("button", { name: "Load more projects" });
      await expect(more).toBeVisible();
      await more.click();
      await expect
        .poll(() => projectSelect.locator("option").count())
        .toBeGreaterThan(previousCount);
    }
    await projectSelect.selectOption(project.id);
    await page.getByLabel("File as").selectOption("note");
    await page.getByLabel("Title *").fill(`First note ${token}`);
    await page.getByRole("button", { name: "File as note" }).click();
    await deferredPost;

    const ledger = page.getByRole("list", { name: "Captured items" });
    const firstItem = ledger.getByRole("button", {
      name: new RegExp(originalA),
    });
    const secondItem = ledger.getByRole("button", {
      name: new RegExp(originalB),
    });
    await secondItem.click();
    await expect(secondItem).toHaveAttribute("aria-pressed", "true");
    await expect(source.locator("pre")).toHaveText(originalB);

    await projectSelect.selectOption(project.id);
    await page.getByLabel("File as").selectOption("note");
    await page.getByLabel("Title *").fill(`Second note ${token}`);
    const secondFileButton = page.getByRole("button", { name: "File as note" });
    await expect(secondFileButton).toBeEnabled();

    const firstResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          `/api/v1/captures/${captureA.id}/file`,
    );
    releasePost();
    expect((await firstResponse).status()).toBe(201);
    await expect(firstItem).toContainText("Filed");
    await expect(secondItem).toHaveAttribute("aria-pressed", "true");
    await expect(source.locator("pre")).toHaveText(originalB);
    await expect(page.getByLabel("Title *")).toHaveValue(
      `Second note ${token}`,
    );
    await expect(secondFileButton).toBeEnabled();

    const secondResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          `/api/v1/captures/${captureB.id}/file`,
    );
    await secondFileButton.click();
    expect((await secondResponse).status()).toBe(201);
    await expect(source.locator("pre")).toHaveText(originalB);
    await expect(secondItem).toContainText("Filed");
  } finally {
    releasePost();
  }
});

test("a stale capture read cannot undo filing after reselecting it", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const token = randomUUID().replaceAll("-", "").slice(0, 10);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Inbox stale read ${token}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = (await projectResponse.json()) as { id: string };
  const originalA = `Capture A ${token}: keep this original.`;
  const originalB = `Capture B ${token}: switch through this original.`;
  const captureResponseA = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: originalA },
  });
  const captureResponseB = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: originalB },
  });
  expect(captureResponseA.status()).toBe(201);
  expect(captureResponseB.status()).toBe(201);
  const captureA = (await captureResponseA.json()) as { id: string };

  let signalPost: () => void = () => {};
  let releasePost: () => void = () => {};
  const postSeen = new Promise<void>((resolve) => {
    signalPost = resolve;
  });
  const postGate = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  await page.route(`**/api/v1/captures/${captureA.id}/file`, async (route) => {
    if (route.request().method() === "POST") {
      signalPost();
      await postGate;
    }
    await route.continue();
  });

  let signalStaleGet: () => void = () => {};
  let releaseStaleGet: () => void = () => {};
  const staleGetSeen = new Promise<void>((resolve) => {
    signalStaleGet = resolve;
  });
  const staleGetGate = new Promise<void>((resolve) => {
    releaseStaleGet = resolve;
  });

  try {
    await page.goto(`/inbox?captureId=${captureA.id}`);
    const source = page.getByRole("article", { name: "Original input" });
    await expect(source.locator("pre")).toHaveText(originalA);
    const projectSelect = page.getByLabel("Project *");
    const projectOption = projectSelect.locator(
      `option[value="${project.id}"]`,
    );
    await expect(projectSelect).toBeEnabled();
    while ((await projectOption.count()) === 0) {
      const previousCount = await projectSelect.locator("option").count();
      const more = page.getByRole("button", { name: "Load more projects" });
      await expect(more).toBeVisible();
      await more.click();
      await expect
        .poll(() => projectSelect.locator("option").count())
        .toBeGreaterThan(previousCount);
    }
    await projectSelect.selectOption(project.id);
    await page.getByLabel("File as").selectOption("note");
    await page.getByLabel("Title *").fill(`Filed note ${token}`);
    await page.getByRole("button", { name: "File as note" }).click();
    await postSeen;

    const ledger = page.getByRole("list", { name: "Captured items" });
    const firstItem = ledger.getByRole("button", {
      name: new RegExp(originalA),
    });
    const secondItem = ledger.getByRole("button", {
      name: new RegExp(originalB),
    });
    await secondItem.click();
    await expect(source.locator("pre")).toHaveText(originalB);

    await page.route(`**/api/v1/captures/${captureA.id}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const staleResponse = await route.fetch();
      expect(staleResponse.status()).toBe(200);
      const snapshot = (await staleResponse.json()) as { state: string };
      expect(snapshot.state).toBe("unfiled");
      signalStaleGet();
      await staleGetGate;
      await route.fulfill({ response: staleResponse });
    });
    await firstItem.click();
    await staleGetSeen;

    const filedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          `/api/v1/captures/${captureA.id}/file`,
    );
    releasePost();
    expect((await filedResponse).status()).toBe(201);
    await expect(firstItem).toContainText("Filed");
    await expect(source.locator("pre")).toHaveText(originalA);
    await expect(
      page.getByRole("heading", { name: "Filed as Knowledge" }),
    ).toBeVisible();

    const oldReadResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === `/api/v1/captures/${captureA.id}`,
    );
    releaseStaleGet();
    expect((await oldReadResponse).status()).toBe(200);
    // The stale response must have time to complete the fetch and React update.
    await page.waitForTimeout(500);
    await expect(firstItem).toContainText("Filed");
    await expect(source.locator("pre")).toHaveText(originalA);
    await expect(
      page.getByRole("heading", { name: "Filed as Knowledge" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "File as note" }),
    ).toHaveCount(0);
  } finally {
    releasePost();
    releaseStaleGet();
  }
});
