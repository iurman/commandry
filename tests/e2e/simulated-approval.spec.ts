import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

async function createProject(request: APIRequestContext, name: string) {
  const response = await request.post("/api/v1/projects", {
    data: { name, type: "general" },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createLinkedResource(
  request: APIRequestContext,
  projectId: string,
  name: string,
) {
  const response = await request.post("/api/v1/resources", {
    data: {
      name,
      kind: "service",
      externalUrl: "https://example.test/?token=must-not-enter-approval",
    },
  });
  expect(response.status()).toBe(201);
  const resource = await response.json();
  const linkResponse = await request.post(
    `/api/v1/projects/${projectId}/resources`,
    { data: { resourceId: resource.id, type: "supports" } },
  );
  expect(linkResponse.status()).toBe(201);
  return { resource, link: await linkResponse.json() };
}

async function createTask(
  request: APIRequestContext,
  projectId: string,
  title: string,
) {
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: `${title} original source` },
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
        body: "Review exact project evidence before any proposed action.",
      },
    },
  );
  expect(filingResponse.status()).toBe(201);
  return (await filingResponse.json()).record;
}

test("a sensitive synthetic action requires exact approval and records no external effect", async ({
  page,
  request,
}) => {
  const token = `LocalApproval${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const project = await createProject(request, `${token} project`);
  const otherProject = await createProject(request, `${token} other project`);
  const selected = await createLinkedResource(
    request,
    project.id,
    `${token} simulated service`,
  );
  const other = await createLinkedResource(
    request,
    otherProject.id,
    `${token} out of scope`,
  );
  const task = await createTask(request, project.id, `${token} review service`);
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    {
      data: {
        selectedKnowledgeIds: [],
        selectedResourceIds: [selected.resource.id],
      },
    },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  expect(packet.snapshot.selectedResources[0].linkId).toBe(selected.link.id);

  const agentResponse = await request.post("/api/v1/agents", {
    data: { name: `${token} reviewer` },
  });
  expect(agentResponse.status()).toBe(201);
  const agent = await agentResponse.json();
  const assignmentResponse = await request.post(
    `/api/v1/agents/${agent.id}/projects`,
    { data: { projectId: project.id } },
  );
  expect(assignmentResponse.status()).toBe(201);
  const runResponse = await request.post(
    `/api/v1/execution-packets/${packet.id}/agent-runs`,
    { data: { agentId: agent.id, occurrenceId: randomUUID() } },
  );
  expect(runResponse.status()).toBe(202);
  const run = await runResponse.json();
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/v1/agent-runs/${run.id}`);
        return (await response.json()).state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");

  const smuggledParameter = await request.post(
    `/api/v1/agent-runs/${run.id}/simulated-actions`,
    {
      data: {
        projectResourceLinkId: selected.link.id,
        mode: "graceful",
        occurrenceId: randomUUID(),
        command: "echo should-never-run",
      },
    },
  );
  expect(smuggledParameter.status()).toBe(400);
  expect((await smuggledParameter.json()).code).toBe("INVALID_BODY");

  const wrongTarget = await request.post(
    `/api/v1/agent-runs/${run.id}/simulated-actions`,
    {
      data: {
        projectResourceLinkId: other.link.id,
        mode: "graceful",
        occurrenceId: randomUUID(),
      },
    },
  );
  expect(wrongTarget.status()).toBe(403);
  expect((await wrongTarget.json()).code).toBe("PROJECT_SCOPE_DENIED");

  const proposalOccurrenceId = randomUUID();
  const proposalBody = {
    projectResourceLinkId: selected.link.id,
    mode: "graceful",
    occurrenceId: proposalOccurrenceId,
  };
  const proposalResponse = await request.post(
    `/api/v1/agent-runs/${run.id}/simulated-actions`,
    { data: proposalBody },
  );
  expect(proposalResponse.status()).toBe(201);
  const proposal = await proposalResponse.json();
  expect(proposal.state).toBe("pending");
  expect(proposal.descriptorDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(proposal.descriptor.actionType).toBe("simulated.resource.restart");
  expect(proposal.descriptor.risk).toBe("sensitive");
  expect(proposal.descriptor.requiredCapability).toBe("infrastructure.restart");
  expect(proposal.descriptor.policy.approvalRequired).toBe(true);
  expect(proposal.descriptor.policy.grantScope).toBe("simulation_only");
  expect(proposal.descriptor.target).toEqual({
    projectId: project.id,
    resourceId: selected.resource.id,
    projectResourceLinkId: selected.link.id,
  });
  expect(proposal.descriptor.packet.digest).toBe(packet.contentDigest);
  expect(proposal.descriptor.externalActions).toEqual([]);
  expect(JSON.stringify(proposal)).not.toContain("must-not-enter-approval");
  const pendingNoticeResponse = await request.get(
    `/api/v1/notifications?projectId=${project.id}`,
  );
  expect(pendingNoticeResponse.status()).toBe(200);
  const pendingNotice = (await pendingNoticeResponse.json()).items.find(
    (item: { kind: string }) => item.kind === "approval",
  );
  expect(pendingNotice).toMatchObject({
    priority: "action_required",
    isSynthetic: true,
  });
  expect(pendingNotice.href).toBe(`/approvals/${proposal.id}`);
  const replayResponse = await request.post(
    `/api/v1/agent-runs/${run.id}/simulated-actions`,
    { data: proposalBody },
  );
  expect(replayResponse.status()).toBe(201);
  expect((await replayResponse.json()).id).toBe(proposal.id);

  const staleDecision = await request.post(
    `/api/v1/approvals/${proposal.id}/decisions`,
    {
      data: {
        decision: "approve",
        expectedDigest: "0".repeat(64),
        occurrenceId: randomUUID(),
      },
    },
  );
  expect(staleDecision.status()).toBe(409);
  expect((await staleDecision.json()).code).toBe("DIGEST_MISMATCH");
  await page.goto(`/approvals/${proposal.id}`);
  await expect(
    page.getByRole("heading", { name: "Simulated resource restart" }),
  ).toBeVisible();
  await expect(page.getByText("infrastructure.restart")).toBeVisible();
  const decisionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/approvals/${proposal.id}/decisions`) &&
      response.request().method() === "POST",
  );
  const approveButton = page.getByRole("button", {
    name: "Approve local simulation",
  });
  await approveButton.scrollIntoViewIfNeeded();
  await approveButton.click();
  const decisionResponse = await decisionResponsePromise;
  expect(decisionResponse.status()).toBe(200);
  expect((await decisionResponse.json()).state).toBe("approved");
  const decidedNoticeResponse = await request.get(
    `/api/v1/notifications?projectId=${project.id}`,
  );
  expect(decidedNoticeResponse.status()).toBe(200);
  expect(
    (await decidedNoticeResponse.json()).items.some(
      (item: { id: string }) => item.id === pendingNotice.id,
    ),
  ).toBe(false);
  const decisionBody = decisionResponse.request().postDataJSON();
  expect(decisionBody.expectedDigest).toBe(proposal.descriptorDigest);
  const decisionReplay = await request.post(
    `/api/v1/approvals/${proposal.id}/decisions`,
    { data: decisionBody },
  );
  expect(decisionReplay.status()).toBe(200);
  expect((await decisionReplay.json()).id).toBe(proposal.id);
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/v1/approvals/${proposal.id}`);
        expect(response.status()).toBe(200);
        return (await response.json()).outcome?.kind ?? null;
      },
      { timeout: 30_000 },
    )
    .toBe("simulated_only");
  const completedResponse = await request.get(
    `/api/v1/approvals/${proposal.id}`,
  );
  const completed = await completedResponse.json();
  expect(completed.outcome.verificationStatus).toBe("unverified");
  expect(completed.outcome.resourceStateChanged).toBe(false);
  expect(completed.outcome.externalActions).toEqual([]);

  const auditEvents: { eventType: string; actor: string }[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    if (cursor) {
      expect(seenCursors.has(cursor)).toBe(false);
      seenCursors.add(cursor);
    }
    const query = new URLSearchParams({ limit: "1" });
    if (cursor) query.set("cursor", cursor);
    const response = await request.get(
      `/api/v1/approvals/${proposal.id}/audit?${query}`,
    );
    expect(response.status()).toBe(200);
    const page = await response.json();
    auditEvents.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  expect(auditEvents.map((event) => event.eventType)).toEqual(
    expect.arrayContaining(["proposed", "approved", "simulation_recorded"]),
  );
  expect(
    auditEvents
      .filter(
        (event) =>
          event.eventType === "proposed" || event.eventType === "approved",
      )
      .every((event) => event.actor === "local-reviewer:unattributed"),
  ).toBe(true);
  expect(
    auditEvents.some(
      (event) =>
        event.eventType === "simulation_recorded" &&
        event.actor === "local-worker",
    ),
  ).toBe(true);
  expect(JSON.stringify(auditEvents)).not.toContain("must-not-enter-approval");
  const resourceResponse = await request.get(
    `/api/v1/resources/${selected.resource.id}`,
  );
  const unchangedResource = await resourceResponse.json();
  expect(unchangedResource.state).toBeNull();
  expect(unchangedResource.lastObservedAt).toBeNull();

  await page.goto(`/agent-runs/${run.id}`);
  await expect(
    page.getByRole("heading", { name: "Create simulated action proposal" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Packet-selected resource link" })
    .selectOption(selected.link.id);
  const secondProposalResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/agent-runs/${run.id}/simulated-actions`) &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create proposal for review" })
    .click();
  const secondProposalResponse = await secondProposalResponsePromise;
  expect(secondProposalResponse.status()).toBe(201);
  const secondProposal = await secondProposalResponse.json();
  await page.getByRole("link", { name: "Review approval request" }).click();
  await expect(page).toHaveURL(new RegExp(`/approvals/${secondProposal.id}$`));
  const rejectionResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/approvals/${secondProposal.id}/decisions`) &&
      response.request().method() === "POST",
  );
  const rejectButton = page.getByRole("button", { name: "Reject proposal" });
  await rejectButton.scrollIntoViewIfNeeded();
  await rejectButton.click();
  const rejectionResponse = await rejectionResponsePromise;
  expect(rejectionResponse.status()).toBe(200);
  expect((await rejectionResponse.json()).state).toBe("rejected");
  const rejectedAfter = await request.get(
    `/api/v1/approvals/${secondProposal.id}`,
  );
  expect((await rejectedAfter.json()).outcome).toBeNull();
  const approvalIds = new Set<string>();
  const listCursors = new Set<string>();
  let listCursor: string | null = null;
  do {
    if (listCursor) {
      expect(listCursors.has(listCursor)).toBe(false);
      listCursors.add(listCursor);
    }
    const query = new URLSearchParams({ limit: "2" });
    if (listCursor) query.set("cursor", listCursor);
    const response = await request.get(`/api/v1/approvals?${query}`);
    expect(response.status()).toBe(200);
    const listing = await response.json();
    for (const item of listing.items) approvalIds.add(item.id);
    listCursor = listing.nextCursor;
  } while (listCursor);
  expect(approvalIds.has(proposal.id)).toBe(true);
  expect(approvalIds.has(secondProposal.id)).toBe(true);
  await page.goto("/approvals");
  await expect(
    page.getByRole("heading", { name: "Approval requests" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
