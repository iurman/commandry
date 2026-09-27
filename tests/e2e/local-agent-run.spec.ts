import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

async function createProject(request: APIRequestContext, name: string) {
  const response = await request.post("/api/v1/projects", {
    data: { name, type: "general" },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createTask(
  request: APIRequestContext,
  projectId: string,
  title: string,
) {
  const captureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `${title}: keep this original source intact.`,
    },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filingResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId,
        kind: "task",
        title,
        body: "Review the saved project context and report what is missing.",
      },
    },
  );
  expect(filingResponse.status()).toBe(201);
  return (await filingResponse.json()).record;
}

test("a synthetic local agent reads only its run scope and reports an unverified result", async ({
  page,
  request,
}) => {
  const token = `LocalAgent${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const project = await createProject(request, `${token} project`);
  const otherProject = await createProject(request, `${token} other project`);
  const task = await createTask(request, project.id, `${token} review context`);
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();

  const agentResponse = await request.post("/api/v1/agents", {
    data: { name: `${token} synthetic reviewer` },
  });
  expect(agentResponse.status()).toBe(201);
  const agent = await agentResponse.json();
  expect(agent.isSynthetic).toBe(true);
  expect(agent.runtime).toBe("local-fake-v1");
  const assignmentResponse = await request.post(
    `/api/v1/agents/${agent.id}/projects`,
    { data: { projectId: project.id } },
  );
  expect(assignmentResponse.status()).toBe(201);
  const assignment = await assignmentResponse.json();
  expect(assignment.projectId).toBe(project.id);

  const unassignedResponse = await request.post("/api/v1/agents", {
    data: { name: `${token} unassigned` },
  });
  expect(unassignedResponse.status()).toBe(201);
  const unassigned = await unassignedResponse.json();
  const deniedStart = await request.post(
    `/api/v1/execution-packets/${packet.id}/agent-runs`,
    { data: { agentId: unassigned.id, occurrenceId: randomUUID() } },
  );
  expect(deniedStart.status()).toBe(403);

  const occurrenceId = randomUUID();
  async function submit(agentId: string) {
    return request.post(`/api/v1/execution-packets/${packet.id}/agent-runs`, {
      data: { agentId, occurrenceId },
    });
  }
  const startedResponse = await submit(agent.id);
  expect(startedResponse.status()).toBe(202);
  const started = await startedResponse.json();
  expect(started.packetId).toBe(packet.id);
  expect(started.agentId).toBe(agent.id);
  expect(started.grant.projectId).toBe(project.id);
  expect(started.grant.operations).toContain("project.brief.read");
  expect(started.isSynthetic).toBe(true);
  const replayResponse = await submit(agent.id);
  expect(replayResponse.status()).toBe(202);
  expect((await replayResponse.json()).id).toBe(started.id);

  const secondAgentResponse = await request.post("/api/v1/agents", {
    data: { name: `${token} second reviewer` },
  });
  expect(secondAgentResponse.status()).toBe(201);
  const secondAgent = await secondAgentResponse.json();
  const secondAssignment = await request.post(
    `/api/v1/agents/${secondAgent.id}/projects`,
    { data: { projectId: project.id } },
  );
  expect(secondAssignment.status()).toBe(201);
  expect((await submit(secondAgent.id)).status()).toBe(409);

  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/v1/agent-runs/${started.id}`);
        expect(response.status()).toBe(200);
        const current = await response.json();
        if (current.state === "failed") throw new Error(current.error);
        return current.state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");
  const resultResponse = await request.get(`/api/v1/agent-runs/${started.id}`);
  const run = await resultResponse.json();
  expect(run.runtime).toBe("local-fake-v1");
  expect(run.isSynthetic).toBe(true);
  expect(run.verificationStatus).toBe("unverified");
  expect(run.externalActions).toEqual([]);
  expect(run.result.isSynthetic).toBe(true);
  expect(run.result.verificationStatus).toBe("unverified");
  expect(run.result.externalActions).toEqual([]);
  expect(run.result.contextReadIds.length).toBeGreaterThan(0);
  const routingResponse = await request.get(
    `/api/v1/execution-packets/${packet.id}/agent-routing?limit=1`,
  );
  expect(routingResponse.status()).toBe(200);
  const routing = await routingResponse.json();
  expect(routing.dispatchMode).toBe("manual-fake-only");
  expect(routing.unassessed).toEqual(["skills", "budget", "provider capacity"]);
  expect(routing.items[0].readOperations).toEqual([
    "project.brief.read",
    "work.read",
  ]);
  const routedAgentIds = new Set<string>(
    routing.items.map((item: { agent: { id: string } }) => item.agent.id),
  );
  let routingCursor = routing.nextCursor;
  while (routingCursor) {
    const response = await request.get(
      `/api/v1/execution-packets/${packet.id}/agent-routing?limit=1&cursor=${routingCursor}`,
    );
    expect(response.status()).toBe(200);
    const page = await response.json();
    for (const item of page.items) routedAgentIds.add(item.agent.id);
    routingCursor = page.nextCursor;
  }
  expect(routedAgentIds).toEqual(new Set([agent.id, secondAgent.id]));
  const cachedEvidence: { id: string }[] = [];
  let cachedCursor: number | null = null;
  do {
    const query = new URLSearchParams({ agentId: agent.id, limit: "1" });
    if (cachedCursor !== null) query.set("cursor", String(cachedCursor));
    const response = await request.get(
      `/api/v1/execution-packets/${packet.id}/cached-local-result?${query}`,
    );
    expect(response.status()).toBe(200);
    const saved = await response.json();
    expect(saved.result.runId).toBe(started.id);
    expect(saved.result.packetDigest).toBe(packet.contentDigest);
    expect(saved.result.verificationStatus).toBe("unverified");
    cachedEvidence.push(...saved.items);
    cachedCursor = saved.nextCursor;
  } while (cachedCursor !== null);
  expect(cachedEvidence.map((item) => item.id)).toEqual(
    run.result.evidence.map((item: { id: string }) => item.id),
  );
  const projectFindingsResponse = await request.get(
    `/api/v1/projects/${project.id}/agent-findings?limit=1`,
  );
  expect(projectFindingsResponse.status()).toBe(200);
  const projectFindings = await projectFindingsResponse.json();
  expect(projectFindings.items[0]).toMatchObject({
    runId: started.id,
    projectId: project.id,
    packetId: packet.id,
    packetDigest: packet.contentDigest,
    isSynthetic: true,
    verificationStatus: "unverified",
    sourceHref: `/api/v1/agent-runs/${started.id}`,
  });
  expect(projectFindings.items[0].evidenceCount).toBe(
    run.result.evidence.length,
  );
  const otherProjectCursor = await request.get(
    `/api/v1/projects/${otherProject.id}/agent-findings?cursor=${started.id}`,
  );
  expect(otherProjectCursor.status()).toBe(400);
  expect((await otherProjectCursor.json()).code).toBe("INVALID_CURSOR");
  const deniedCached = await request.get(
    `/api/v1/execution-packets/${packet.id}/cached-local-result?agentId=${unassigned.id}`,
  );
  expect(deniedCached.status()).toBe(403);
  for (const evidence of run.result.evidence) {
    expect((await request.get(evidence.href)).status(), evidence.href).toBe(
      200,
    );
  }
  const callbackEvents: {
    id: string;
    kind: string;
    stage: string | null;
    artifactSha256: string | null;
    sourceLabel: string;
  }[] = [];
  let callbackCursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "2" });
    if (callbackCursor) query.set("cursor", callbackCursor);
    const response = await request.get(
      `/api/v1/agent-runs/${started.id}/callbacks?${query}`,
    );
    expect(response.status()).toBe(200);
    const callbackPage = await response.json();
    callbackEvents.push(...callbackPage.items);
    callbackCursor = callbackPage.nextCursor;
  } while (callbackCursor);
  expect(callbackEvents).toHaveLength(5);
  expect(
    new Set(
      callbackEvents
        .filter((event) => event.kind === "heartbeat")
        .map((event) => event.stage),
    ),
  ).toEqual(new Set(["started", "brief_read", "work_read", "result_prepared"]));
  const artifactEvent = callbackEvents.find(
    (event) => event.kind === "artifact",
  );
  expect(artifactEvent?.sourceLabel).toBe("Synthetic local runner callback");
  expect(artifactEvent?.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
  const artifactResponse = await request.get(
    `/api/v1/agent-runs/${started.id}/callbacks/${artifactEvent?.id}/artifact`,
  );
  expect(artifactResponse.status()).toBe(200);
  expect(artifactResponse.headers()["content-disposition"]).toContain(
    "attachment",
  );
  expect((await artifactResponse.json()).sourceLabel).toBe(
    "Synthetic local runner report",
  );
  const unauthorizedCallback = await request.post(
    `/api/v1/agent-runs/${started.id}/callbacks`,
    {
      data: {
        version: 1,
        attemptId: run.attemptHistory[0].id,
        sequence: 6,
        kind: "heartbeat",
        stage: "started",
      },
    },
  );
  expect(unauthorizedCallback.status()).toBe(403);
  expect((await unauthorizedCallback.json()).code).toBe("CALLBACK_AUTH_DENIED");

  const terminalRead = await request.post(
    `/api/v1/agent-runs/${started.id}/context-reads`,
    {
      data: {
        projectId: project.id,
        operation: "project.brief.read",
        reason: "Inspect cited local context for this run.",
      },
    },
  );
  expect(terminalRead.status()).toBe(403);
  expect((await terminalRead.json()).code).toBe("RUN_NOT_ACTIVE");

  const wrongProject = await request.post(
    `/api/v1/agent-runs/${started.id}/context-reads`,
    {
      data: {
        projectId: otherProject.id,
        operation: "project.brief.read",
        reason: "Attempt an out-of-scope read.",
      },
    },
  );
  expect(wrongProject.status()).toBe(403);
  expect((await wrongProject.json()).code).toBe("PROJECT_SCOPE_DENIED");
  const wrongOperation = await request.post(
    `/api/v1/agent-runs/${started.id}/context-reads`,
    {
      data: {
        projectId: project.id,
        operation: "external.action",
        reason:
          "Attempt an ungranted operation. Authorization: Bearer sk_example Cookie: session=example",
      },
    },
  );
  expect(wrongOperation.status()).toBe(403);
  expect((await wrongOperation.json()).code).toBe("OPERATION_DENIED");

  const auditIds = new Set<string>();
  const auditItems: {
    actor: string;
    decision: string;
    operation: string;
    reason: string | null;
    stage: string | null;
  }[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    if (cursor) {
      expect(seenCursors.has(cursor)).toBe(false);
      seenCursors.add(cursor);
    }
    const query = new URLSearchParams({ limit: "2" });
    if (cursor) query.set("cursor", cursor);
    const response = await request.get(
      `/api/v1/agent-runs/${started.id}/audit?${query}`,
    );
    expect(response.status()).toBe(200);
    const auditPage = await response.json();
    for (const item of auditPage.items) {
      auditIds.add(item.id);
      auditItems.push(item);
    }
    cursor = auditPage.nextCursor;
  } while (cursor);
  expect(auditIds.size).toBeGreaterThanOrEqual(4);
  expect(
    new Set(
      auditItems
        .filter((item) => item.operation === "local_agent_run.progress")
        .map((item) => item.stage),
    ),
  ).toEqual(new Set(["brief_read", "work_read", "result_prepared"]));
  expect(
    auditItems.some(
      (item) =>
        item.actor === `synthetic-agent:${agent.id}` &&
        item.decision === "allowed" &&
        item.operation === "project.brief.read",
    ),
  ).toBe(true);
  expect(
    auditItems.filter((item) => item.decision === "denied").length,
  ).toBeGreaterThanOrEqual(3);
  expect(
    auditItems
      .filter((item) => item.decision === "denied")
      .every((item) => item.actor === "local-reviewer:unattributed"),
  ).toBe(true);
  expect(JSON.stringify(auditItems)).not.toContain("sk_example");
  expect(JSON.stringify(auditItems)).not.toContain("session=example");

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/agents");
  await expect(
    page.getByRole("heading", { name: "Local agents" }),
  ).toBeVisible();
  const projectScope = page.getByRole("combobox", { name: "Project scope *" });
  await expect
    .poll(() => projectScope.locator('option[value]:not([value=""])').count())
    .toBeGreaterThan(0);
  const visibleProjectId = await projectScope
    .locator('option[value]:not([value=""])')
    .first()
    .getAttribute("value");
  expect(visibleProjectId).toBeTruthy();
  await page.getByRole("textbox", { name: "Name *" }).fill(`${token} UI agent`);
  await projectScope.selectOption(visibleProjectId!);
  const uiAgentResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/agents") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create local agent" }).click();
  const uiAgentResponse = await uiAgentResponsePromise;
  expect(uiAgentResponse.status()).toBe(201);
  const uiAgent = await uiAgentResponse.json();
  await expect(page.getByRole("article", { name: uiAgent.name })).toBeVisible();
  await expect(
    page.getByText(
      `${uiAgent.name} was created with one project-scoped read assignment.`,
    ),
  ).toBeVisible();
  const uiAgentScopesResponse = await request.get(
    `/api/v1/agents/${uiAgent.id}/projects`,
  );
  expect(uiAgentScopesResponse.status()).toBe(200);
  expect((await uiAgentScopesResponse.json()).items[0].projectId).toBe(
    visibleProjectId,
  );
  await page.goto(`/execution-packets/${packet.id}`);
  await expect(
    page.getByRole("heading", { name: "Start fake local run" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Eligible project-scoped agent" })
    .selectOption(agent.id);
  await expect(
    page.getByText(/Skills, budget, and provider capacity are unassessed/),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Saved fake-run result" }),
  ).toBeVisible();
  const uiRunResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/execution-packets/${packet.id}/agent-runs`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Start fake local run" }).click();
  const uiRunResponse = await uiRunResponsePromise;
  expect(uiRunResponse.status()).toBe(202);
  const uiRun = await uiRunResponse.json();
  await page.getByRole("link", { name: "Review agent run" }).click();
  await expect(page).toHaveURL(new RegExp(`/agent-runs/${uiRun.id}$`));
  await expect(
    page.getByRole("heading", { name: "Fake local run" }),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/v1/agent-runs/${uiRun.id}`);
        return (await response.json()).state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");
  await page.reload();
  await expect(
    page.getByText(/This is a synthetic, unverified result/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Run timeline and audit" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Runner heartbeats and artifacts" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download synthetic-run-report.json" }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic worker: result prepared"),
  ).toBeVisible();
  const terminalCancel = await request.post(
    `/api/v1/agent-runs/${started.id}/cancel`,
  );
  expect(terminalCancel.status()).toBe(200);
  expect((await terminalCancel.json()).state).toBe("succeeded");
  await expect(page.getByText("Unverified").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(`/projects/${project.id}`);
  await expect(
    page.getByRole("heading", { name: "Saved local agent findings" }),
  ).toBeVisible();
  const savedFinding = page
    .getByRole("article", { name: "saved fake agent finding" })
    .filter({
      has: page.locator(`a[href="/agent-runs/${started.id}"]`),
    });
  await expect(savedFinding).toBeVisible();
  await expect(savedFinding).toContainText(task.title);
  await expect(
    savedFinding.getByRole("link", { name: "Review fake run and evidence" }),
  ).toHaveAttribute("href", `/agent-runs/${started.id}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
