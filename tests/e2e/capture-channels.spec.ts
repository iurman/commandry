import { expect, test } from "@playwright/test";

test("pasted source channels keep exact text, worker suggestions, and filed search", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const suffix = crypto.randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Source channels ${suffix}`, type: "personal" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = (await projectResponse.json()) as { id: string };
  await page.goto("/inbox");

  const channels = [
    { value: "email", label: "Original pasted email *" },
    { value: "conversation", label: "Original pasted conversation *" },
    { value: "voice_transcript", label: "Original entered transcript *" },
  ] as const;
  for (const channel of channels) {
    const original = `  Need to review ${suffix} ${channel.value}.\nKeep this exact line.  `;
    await page.getByLabel("Text source").selectOption(channel.value);
    await page.getByLabel(channel.label).fill(original);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/captures") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save to Inbox" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const capture = (await response.json()) as {
      id: string;
      inputType: string;
    };
    expect(capture.inputType).toBe(channel.value);
    const source = page.locator(".cmd-capture-original");
    await expect(source).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => source.locator("pre").textContent()).toBe(original);
    const readResponse = await request.get(`/api/v1/captures/${capture.id}`);
    expect(readResponse.status()).toBe(200);
    expect((await readResponse.json()).originalContent).toBe(original);
    if (channel.value === "email") {
      await expect(page.getByText("Local deterministic rule")).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText(/this pasted email triggered/)).toBeVisible();
    }
    const filedResponse = await request.post(
      `/api/v1/captures/${capture.id}/file`,
      {
        data: {
          projectId: project.id,
          kind: "note",
          title: `Source ${channel.value} ${suffix}`,
          body: original,
        },
      },
    );
    expect(filedResponse.status()).toBe(201);
    const filed = (await filedResponse.json()) as { record: { id: string } };
    const search = await request.get(
      `/api/v1/search?q=${encodeURIComponent(suffix)}&projectId=${project.id}`,
    );
    expect(search.status()).toBe(200);
    const results = (await search.json()) as {
      items: Array<{ id: string; kind: string }>;
    };
    expect(results.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: filed.record.id, kind: "note" }),
      ]),
    );
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("a raster image previews locally while exact bytes remain downloadable", async ({
  page,
  request,
}) => {
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XhQAAAAASUVORK5CYII=",
    "base64",
  );
  await page.goto("/inbox");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByLabel("Original file *").setInputFiles({
    name: "garden-marker.png",
    mimeType: "image/png",
    buffer: image,
  });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/captures/files") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save to Inbox" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const capture = (await response.json()) as {
    id: string;
    file: { previewHref: string; downloadHref: string };
  };
  expect(capture.file.previewHref).toBe(
    `/api/v1/captures/${capture.id}/preview-image`,
  );
  const preview = page.getByRole("img", {
    name: "Local preview of garden-marker.png",
  });
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(1);
  const previewResponse = await request.get(capture.file.previewHref);
  expect(previewResponse.status()).toBe(200);
  expect(previewResponse.headers()["content-type"]).toBe("image/png");
  expect(Buffer.from(await previewResponse.body())).toEqual(image);
  const originalResponse = await request.get(capture.file.downloadHref);
  expect(originalResponse.status()).toBe(200);
  expect(originalResponse.headers()["content-disposition"]).toContain(
    "attachment",
  );
  expect(Buffer.from(await originalResponse.body())).toEqual(image);

  const svgResponse = await request.post("/api/v1/captures/files", {
    multipart: {
      file: {
        name: "unpreviewed.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
      },
    },
  });
  expect(svgResponse.status()).toBe(201);
  const svg = (await svgResponse.json()) as {
    id: string;
    file: { previewHref?: string };
  };
  expect(svg.file.previewHref).toBeUndefined();
  const unsupported = await request.get(
    `/api/v1/captures/${svg.id}/preview-image`,
  );
  expect(unsupported.status()).toBe(415);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});
