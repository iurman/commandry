import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

// Synthetic records against the disposable built application only.
export async function foundationTaskProposalSmoke({
  origin,
  cookie,
  trustedOrigin,
  environment,
  project,
  other,
  issue,
  connect,
  call,
  write,
  existingClient,
}) {
  const issued = await issue(["work.propose"], "Explicit task proposal writer");
  const client = await connect(issued.token);
  assert.deepEqual(
    (await client.listTools()).tools.map((tool) => tool.name),
    ["propose_task"],
  );
  assert.equal(
    (await existingClient.listTools()).tools.some(
      (tool) => tool.name === "propose_task",
    ),
    false,
  );
  const input = {
    originalContent:
      "\ufeff Unverified synthetic <img src=x onerror=alert(1)>\r\ncafe\u0301 \ud83d\ude80",
    proposedTitle: "Synthetic proposal to review",
    proposedBody: "Unverified proposal body; never an execution instruction.",
    rationale: "Synthetic transport acceptance evidence.",
  };
  const key = randomUUID();
  const submitted = await call(client, "propose_task", {
    ...input,
    idempotencyKey: key,
  });
  const record = submitted.record;
  assert.equal(record.status, "pending");
  assert.equal(record.verification, "unverified");
  assert.equal(record.projectId, project.id);
  assert.equal(record.environment, environment);
  assert.equal(record.clientId, issued.client.id);
  assert.equal(record.principalId, `foundation-client:${issued.client.id}`);
  assert.equal(
    record.sourceDigest,
    createHash("sha256").update(input.originalContent, "utf8").digest("hex"),
  );
  assert.equal(
    JSON.stringify(submitted).includes(input.originalContent),
    false,
  );
  const path = `/api/v1/foundation/task-proposals/by-capture/${record.captureId}?projectId=${project.id}`;
  async function get(headers, suffix = path, status = 200) {
    const response = await fetch(origin + suffix, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, status, await response.clone().text());
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  await get({}, path, 401);
  await get({ authorization: `Bearer ${issued.token}` }, path, 401);
  await get({ cookie }, path.replace(project.id, other.id), 404);
  await get({ cookie }, path + "&projectId=" + project.id, 400);
  await get({ cookie }, path + "&actor=user:spoof", 400);
  const detail = await get({ cookie });
  assert.equal(detail.capture.originalContent, input.originalContent);
  assert.equal(detail.capture.source, "foundation-client");
  assert.equal(detail.capture.author, record.principalId);
  assert.equal(detail.suggestion.proposal.contentDigest, record.proposalDigest);
  assert.equal(detail.decision, null);
  for (const kind of ["task", "note", "link", "document"]) {
    const denied = await write(
      `/api/v1/captures/${record.captureId}/file`,
      {
        projectId: project.id,
        kind,
        title: "Bypass attempt",
        body: "Synthetic bypass",
      },
      409,
    );
    assert.equal(denied.code, "CAPTURE_REVIEW_REQUIRED");
  }
  assert.equal(
    (
      await write(
        `/api/v1/captures/${record.captureId}/triage-suggestion`,
        {},
        409,
      )
    ).code,
    "CAPTURE_REVIEW_REQUIRED",
  );
  assert.equal(
    (
      await write(
        `/api/v1/captures/${record.captureId}/triage`,
        { decision: "reject" },
        409,
      )
    ).code,
    "CAPTURE_REVIEW_REQUIRED",
  );
  const review = {
    projectId: project.id,
    proposalId: record.proposalId,
    expectedVersion: 1,
    expectedProposalDigest: record.proposalDigest,
    expectedSourceDigest: record.sourceDigest,
    decision: "approve",
    selectedTitle: "Owner selected synthetic task",
    selectedBody: "Owner correction\r\nExact selected body cafe\u0301",
  };
  const reviewPath = "/api/v1/foundation/task-proposals/review";
  const ownerHeaders = {
    cookie,
    origin: trustedOrigin,
    "content-type": "application/json",
  };
  for (const [headers, body, status] of [
    [
      {
        ...ownerHeaders,
        origin: "https://untrusted.invalid",
        "idempotency-key": randomUUID(),
      },
      review,
      403,
    ],
    [ownerHeaders, review, 400],
    [
      { ...ownerHeaders, "idempotency-key": randomUUID() },
      { ...review, actor: "user:spoof" },
      400,
    ],
  ]) {
    const response = await fetch(origin + reviewPath, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(response.status, status, await response.clone().text());
  }
  for (const [headers, body, status] of [
    [
      {
        authorization: `Bearer ${issued.token}`,
        origin: trustedOrigin,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      JSON.stringify(review),
      401,
    ],
    [
      { ...ownerHeaders, "idempotency-key": randomUUID() },
      " ".repeat(524289) + JSON.stringify(review),
      413,
    ],
    [
      { ...ownerHeaders, "idempotency-key": randomUUID() },
      Buffer.from([0xff]),
      400,
    ],
  ]) {
    const response = await fetch(origin + reviewPath, {
      method: "POST",
      headers,
      body,
    });
    assert.equal(response.status, status, await response.clone().text());
  }
  await write(
    reviewPath,
    { ...review, expectedProposalDigest: "0".repeat(64) },
    409,
  );
  const reviewKey = randomUUID();
  const approved = await write(reviewPath, review, 200, reviewKey);
  assert.equal(approved.record.work.title, review.selectedTitle);
  assert.equal(approved.record.work.description, review.selectedBody);
  assert.equal(approved.record.work.sourceCaptureId, record.captureId);
  assert.equal(approved.record.work.status, "open");
  assert.equal(approved.record.work.assigneeKind, "unassigned");
  assert.match(approved.record.decision.actor, /^user:/);
  const replay = await write(reviewPath, review, 200, reviewKey);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.record, approved.record);
  assert.equal(
    (await get({ cookie })).capture.originalContent,
    input.originalContent,
  );
  const historical = await call(client, "propose_task", {
    ...input,
    idempotencyKey: key,
  });
  assert.equal(historical.replayed, true);
  assert.deepEqual(historical.record, record);
  const changed = await client.callTool({
    name: "propose_task",
    arguments: { ...input, proposedTitle: "Changed", idempotencyKey: key },
  });
  assert.equal(changed.isError, true);
  await write(
    reviewPath,
    {
      ...review,
      decision: "reject",
      selectedTitle: undefined,
      selectedBody: undefined,
    },
    409,
  );
  const rejectedSubmission = await call(client, "propose_task", {
    ...input,
    proposedTitle: "Reject this synthetic proposal",
    idempotencyKey: randomUUID(),
  });
  const rejected = rejectedSubmission.record;
  const rejection = await write(
    reviewPath,
    {
      projectId: project.id,
      proposalId: rejected.proposalId,
      expectedVersion: 1,
      expectedProposalDigest: rejected.proposalDigest,
      expectedSourceDigest: rejected.sourceDigest,
      decision: "reject",
    },
    200,
  );
  assert.equal(rejection.record.work, null);
  assert.equal(rejection.record.decision.decision, "reject");
  console.log(
    `Task proposal built-app SDK/HTTP passed (${environment}): explicit write-only tool, exact originals, private owner reads, strict review, bypass denials, canonical approval, rejection and historical retries.`,
  );
}
