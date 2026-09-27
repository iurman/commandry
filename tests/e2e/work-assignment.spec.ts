import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Work assignment is scoped, visible, audited, and saved in packet evidence", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Assigned Work ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const otherResponse = await request.post("/api/v1/projects", {
    data: { name: `Other assignment ${suffix}`, type: "general" },
  });
  expect(otherResponse.status()).toBe(201);
  const other = await otherResponse.json();
  const original = `Original assignment source ${suffix}`;
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: original },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filedResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Review assigned source ${suffix}`,
        body: "Keep the original capture intact",
      },
    },
  );
  expect(filedResponse.status()).toBe(201);
  const task = (await filedResponse.json()).record;
  const agentResponse = await request.post("/api/v1/agents", {
    data: { name: `Assigned reviewer ${suffix}` },
  });
  expect(agentResponse.status()).toBe(201);
  const agent = await agentResponse.json();
  expect(
    (
      await request.post(`/api/v1/agents/${agent.id}/projects`, {
        data: { projectId: project.id },
      })
    ).status(),
  ).toBe(201);
  const outsideResponse = await request.post("/api/v1/agents", {
    data: { name: `Outside reviewer ${suffix}` },
  });
  expect(outsideResponse.status()).toBe(201);
  const outside = await outsideResponse.json();
  expect(
    (
      await request.post(`/api/v1/agents/${outside.id}/projects`, {
        data: { projectId: other.id },
      })
    ).status(),
  ).toBe(201);

  await page.goto(`/work-items/${task.id}`);
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();
  const assignment = page.getByRole("region", { name: "Assigned to" });
  await expect(assignment.getByText("Assigned: Unassigned")).toBeVisible();
  await assignment.getByLabel("Assignee").selectOption("local_user");
  await assignment.getByRole("button", { name: "Save assignment" }).click();
  await expect(
    assignment.getByText("Assigned: Local user (unattributed)"),
  ).toBeVisible();
  await expect(
    assignment.getByText(/Unassigned to Local user \(unattributed\)/),
  ).toBeVisible();
  const localUserTask = await (
    await request.get(`/api/v1/work-items/${task.id}`)
  ).json();
  const denied = await request.put(`/api/v1/work-items/${task.id}/assignment`, {
    data: {
      expectedUpdatedAt: localUserTask.updatedAt,
      assigneeKind: "agent",
      agentId: outside.id,
    },
  });
  expect(denied.status()).toBe(409);
  expect((await denied.json()).code).toBe("AGENT_NOT_IN_PROJECT");

  await assignment.getByLabel("Assignee").selectOption("agent");
  const agentChoice = assignment.getByLabel("Project-scoped agent");
  await expect(agentChoice.locator(`option[value="${agent.id}"]`)).toHaveCount(
    1,
  );
  await expect(
    agentChoice.locator(`option[value="${outside.id}"]`),
  ).toHaveCount(0);
  await agentChoice.selectOption(agent.id);
  await assignment.getByRole("button", { name: "Save assignment" }).click();
  const label = `Synthetic local agent: ${agent.name}`;
  await expect(assignment.getByText(`Assigned: ${label}`)).toBeVisible();
  const eventPage = await (
    await request.get(`/api/v1/work-items/${task.id}/assignment-events`)
  ).json();
  const latest = eventPage.items[0];
  expect(latest).toMatchObject({
    nextKind: "agent",
    nextAgentId: agent.id,
    nextLabel: label,
    actor: "local-user:unattributed",
  });
  await expect(
    assignment.getByRole("link", { name: "Exact event" }).first(),
  ).toHaveAttribute("href", `/api/v1/work-item-assignment-events/${latest.id}`);
  expect(
    (
      await (await request.get(`/api/v1/projects/${project.id}/work`)).json()
    ).items.find((item: { id: string }) => item.id === task.id).assigneeLabel,
  ).toBe(label);
  const brief = await (
    await request.get(`/api/v1/projects/${project.id}/brief`)
  ).json();
  const briefWork = brief.sections.work.items.find(
    (item: { id: string }) => item.id === task.id,
  );
  expect(briefWork.detail).toContain(label);
  expect(briefWork.evidence).toContainEqual(
    expect.objectContaining({
      kind: "work_item_assignment_event",
      id: latest.id,
    }),
  );
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  expect(packet.snapshot.objective.assignee).toMatchObject({
    label,
    evidence: { id: latest.id },
  });

  await page.goto(`/projects/${project.id}`);
  await expect(
    page
      .getByRole("list", { name: "Project work" })
      .getByText(`Assigned: ${label}`),
  ).toBeVisible();
  await page.goto(`/work?projectId=${project.id}`);
  await expect(
    page
      .getByRole("list", { name: "All work" })
      .getByText(`Assigned: ${label}`),
  ).toBeVisible();
  await page.goto(`/work-items/${task.id}`);
  const currentAssignment = page.getByRole("region", { name: "Assigned to" });

  await currentAssignment.getByLabel("Assignee").selectOption("unassigned");
  await currentAssignment
    .getByRole("button", { name: "Save assignment" })
    .click();
  await expect(
    currentAssignment.getByText("Assigned: Unassigned"),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/v1/execution-packets/${packet.id}`)).json())
      .snapshot.objective.assignee.label,
  ).toBe(label);
  expect(
    (await (await request.get(`/api/v1/captures/${capture.id}`)).json())
      .originalContent,
  ).toBe(original);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
