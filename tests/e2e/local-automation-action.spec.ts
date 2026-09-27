import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("opted-in automation files a traceable synthetic project note", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Automation note project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  await page.goto("/automations");
  await page.getByLabel("Name").fill(`Synthetic note routine ${suffix}`);
  const projectChoice = page.getByLabel("Project", { exact: true });
  const projectOption = projectChoice.locator(`option[value="${project.id}"]`);
  while ((await projectOption.count()) === 0) {
    const before = await projectChoice.locator("option").count();
    await page
      .getByRole("button", { name: "Load more project choices" })
      .click();
    await expect
      .poll(() => projectChoice.locator("option").count())
      .toBeGreaterThan(before);
  }
  await projectChoice.selectOption(project.id);
  await page
    .getByLabel("Create a synthetic project note for each successful run")
    .check();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const createdPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/automations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create local routine" }).click();
  const createdResponse = await createdPromise;
  expect(createdResponse.status()).toBe(201);
  const definition = await createdResponse.json();
  expect(definition.localAction).toMatchObject({
    kind: "create_project_note",
    capabilityReference: "commandry.project.knowledge.create",
    risk: "reversible",
    approvalBehavior: "definition_opt_in_local_only",
  });
  await page
    .getByRole("link", { name: `Synthetic note routine ${suffix}` })
    .click();
  await expect(
    page.getByText("Reversible local note; definition opt-in only"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/automations/${definition.id}/runs?limit=1`,
        );
        expect(response.status()).toBe(200);
        return (await response.json()).items[0]?.state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");
  const runsResponse = await request.get(
    `/api/v1/automations/${definition.id}/runs?limit=1`,
  );
  const run = (await runsResponse.json()).items[0];
  expect(run.result).toMatchObject({
    isSynthetic: true,
    verificationStatus: "unverified",
    externalActions: [],
    localAction: { kind: "create_project_note" },
  });
  const action = run.result.localAction;
  const captureResponse = await request.get(
    `/api/v1/captures/${action.captureId}`,
  );
  expect(captureResponse.status()).toBe(200);
  const capture = await captureResponse.json();
  expect(capture).toMatchObject({
    source: "automation-local-synthetic",
    author: "system:local-automation-worker",
    projectId: project.id,
    filedRecord: { kind: "note", id: action.recordId },
  });
  expect(capture.originalContent).toContain(`Run: ${run.id}`);
  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const briefFact = (await briefResponse.json()).sections.knowledge.items.find(
    (item: { id: string }) => item.id === action.recordId,
  );
  expect(briefFact.evidence).toContainEqual(
    expect.objectContaining({ kind: "capture", id: action.captureId }),
  );
  const auditResponse = await request.get(
    `/api/v1/automations/${definition.id}/audit?limit=20`,
  );
  expect(auditResponse.status()).toBe(200);
  const audit = (await auditResponse.json()).items;
  expect(
    audit.filter(
      (item: { operation: string }) =>
        item.operation === "automation.local_note_created",
    ),
  ).toHaveLength(1);
  await expect(
    page.getByRole("link", { name: "Open generated synthetic project note" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open generated synthetic project note" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Synthetic automation summary: Synthetic note routine ${suffix}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View exact original capture" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
