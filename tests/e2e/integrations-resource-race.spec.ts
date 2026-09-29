import { expect, test } from "@playwright/test";

test("a previous project's late resource page cannot replace the selected project's choices or cursor", async ({
  page,
}) => {
  let releaseOldPage!: () => void;
  const oldPageGate = new Promise<void>((resolve) => {
    releaseOldPage = resolve;
  });
  let markOldPageRequested!: () => void;
  const oldPageRequested = new Promise<void>((resolve) => {
    markOldPageRequested = resolve;
  });

  await page.route(
    (url) => url.pathname === "/api/v1/integrations",
    async (route) => {
      await route.fulfill({ json: { items: [], nextCursor: null } });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/v1/projects",
    async (route) => {
      await route.fulfill({
        json: {
          items: [
            { id: "project-a", name: "Project A" },
            { id: "project-b", name: "Project B" },
          ],
          nextCursor: null,
        },
      });
    },
  );
  await page.route(
    (url) => /^\/api\/v1\/projects\/[^/]+\/resources$/.test(url.pathname),
    async (route) => {
      const url = new URL(route.request().url());
      const project = url.pathname.split("/")[4];
      const cursor = url.searchParams.get("cursor");
      if (project === "project-a" && cursor === "a-second") {
        markOldPageRequested();
        await oldPageGate;
      }
      const resources =
        project === "project-a"
          ? cursor
            ? [{ id: "a-2", name: "A second resource" }]
            : [{ id: "a-1", name: "A first resource" }]
          : cursor
            ? [{ id: "b-2", name: "B second resource" }]
            : [{ id: "b-1", name: "B first resource" }];
      await route.fulfill({
        json: {
          items: resources.map((resource) => ({
            id: `link-${resource.id}`,
            type: "supports",
            inverseType: "supported-by",
            resource,
          })),
          nextCursor: cursor
            ? null
            : project === "project-a"
              ? "a-second"
              : "b-second",
        },
      });
    },
  );

  await page.goto("/integrations");
  const projectSelect = page.getByLabel("Project", { exact: true });
  const resourceSelect = page.getByLabel("Linked resource");
  const loadMore = page.getByRole("button", { name: "Load more resources" });
  await expect(projectSelect).toHaveValue("project-a");
  await page.getByLabel("Source category").selectOption("synthetic-operations");
  await expect(resourceSelect.locator('option[value="a-1"]')).toHaveCount(1);
  await loadMore.click();
  await oldPageRequested;

  await projectSelect.selectOption("project-b");
  await expect(resourceSelect.locator('option[value="b-1"]')).toHaveCount(1);
  await expect(loadMore).toBeVisible();

  const staleResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/v1/projects/project-a/resources" &&
      url.searchParams.get("cursor") === "a-second"
    );
  });
  releaseOldPage();
  await staleResponse;
  await expect(loadMore).toBeEnabled();
  await expect(resourceSelect.locator('option[value="a-2"]')).toHaveCount(0);
  await expect(resourceSelect.locator('option[value="b-1"]')).toHaveCount(1);

  await loadMore.click();
  await expect(resourceSelect.locator('option[value="b-2"]')).toHaveCount(1);
  await expect(resourceSelect.locator('option[value^="a-"]')).toHaveCount(0);
});
