import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const workflowPath = "/api/v1/foundation/workflows";
const digest = (text) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const expiresAt = () => new Date(Date.now() + 3600000).toISOString();
const governedTools = {
  "improvement.propose": ["propose_improvement"],
  "improvement.read": ["get_improvement", "list_improvements"],
  "finding.propose": ["propose_finding"],
  "finding.read": ["get_finding"],
  "onboarding.propose": ["propose_host_onboarding"],
  "onboarding.read": ["get_host_onboarding", "list_host_onboardings"],
};

// Independent synthetic source records; no owner's corpus or inference is used.
export async function createGovernedFindingFixture({
  client,
  call,
  write,
  project,
}) {
  const source =
    "Synthetic canonical evidence. Byte identity is not factual verification.";
  const capture = await write("/api/v1/captures", {
    inputType: "text",
    originalContent: source,
  });
  const knowledge = (
    await write(`/api/v1/captures/${capture.id}/file`, {
      projectId: project.id,
      kind: "note",
      title: "Synthetic governed evidence source",
      body: source,
    })
  ).record;
  const contentDigest = digest(source);
  const evidence = (
    await call(client, "record_evidence", {
      sourceKind: "knowledge_revision",
      sourceId: knowledge.id,
      sourceVersion: "1",
      contentDigest,
      locator: `commandry:knowledge/${knowledge.id}/versions/1`,
      observedAt: null,
      availability: "available",
      idempotencyKey: randomUUID(),
    })
  ).record;
  assert.equal(evidence.verification, "unverified");
  return {
    evidence,
    citation: {
      evidenceId: evidence.id,
      sourceKind: "knowledge_revision",
      sourceId: knowledge.id,
      sourceVersion: "1",
      contentDigest,
      selection: "whole_source",
    },
  };
}

export function governedOnboardingInput(evidenceId, label = "SDK") {
  return {
    target: {
      mode: "create",
      name: `Synthetic ${label} host ` + "long-inventory-name-".repeat(5),
      subtype: "synthetic",
      externalUrl: null,
      identity: {
        namespace: "provider",
        authority: "disposable-governed-rehearsal",
        externalId: randomUUID(),
        assurance: "owner_asserted",
      },
    },
    relationship: "supports",
    rationale: `Synthetic ${label} onboarding; local inventory only.`,
    evidenceIds: [evidenceId],
  };
}

// These are explicitly synthetic deterministic artifacts, never model results.
export async function createGovernedImprovementFixture({
  client,
  call,
  write,
  project,
}) {
  const invoke = (name, args) => call(client, name, args);
  async function configuration(kind, content, parentIds = []) {
    return (
      await invoke("record_configuration", {
        kind,
        content,
        parentIds,
        sourceCommit: null,
        idempotencyKey: randomUUID(),
      })
    ).record;
  }
  const baseline = await configuration(
    "skill",
    "Synthetic baseline fixture. No inference or installation.",
  );
  const candidate = await configuration(
    "skill",
    "Synthetic candidate fixture. No inference or installation.",
    [baseline.id],
  );
  const judge = await configuration(
    "model",
    "Synthetic deterministic scope check. No judge inference.",
  );
  async function definition(name, configurationIds) {
    const input = {
      schemaVersion: 1,
      id: randomUUID(),
      version: 1,
      name,
      configurationIds,
      cases: [
        {
          id: "scope-fixture",
          fixtureDigest: digest("synthetic fixture input"),
          rubricDigest: digest("synthetic scope rubric"),
          hardGates: ["scope"],
        },
      ],
      conditions: ["baseline", "candidate"],
      repetitions: 1,
      disclosure: "local_only",
    };
    await invoke("record_evaluation_definition", {
      ...input,
      idempotencyKey: randomUUID(),
    });
    return input;
  }
  async function assessment(definition, condition, configuration, result) {
    const trial = {
      schemaVersion: 1,
      id: randomUUID(),
      attemptId: randomUUID(),
      definitionId: definition.id,
      caseId: "scope-fixture",
      condition,
      repetition: 1,
      configurationIds: [configuration.id],
      model: "synthetic-deterministic-fixture",
      runtime: "disposable-built-app-no-inference",
      inputDigest: definition.cases[0].fixtureDigest,
      artifactDigests: [digest(randomUUID())],
      outcome: "completed",
      usage: { inputTokens: null, outputTokens: null },
      recordedAt: new Date().toISOString(),
    };
    await invoke("record_evaluation_trial", {
      ...trial,
      idempotencyKey: randomUUID(),
    });
    const input = {
      schemaVersion: 1,
      id: randomUUID(),
      trialId: trial.id,
      version: 1,
      trialArtifactDigest: trial.artifactDigests[0],
      rubricDigest: definition.cases[0].rubricDigest,
      judgeConfigurationId: judge.id,
      checks: [{ id: "scope", result, hardGate: true }],
      uncertainty:
        "Synthetic deterministic artifact, not measured model performance.",
      reviewStatus: "unreviewed",
      recordedAt: new Date().toISOString(),
    };
    await invoke("record_evaluation_assessment", {
      ...input,
      idempotencyKey: randomUUID(),
    });
    return input;
  }
  async function review(input, version = input.version + 1) {
    const reviewed = {
      ...input,
      projectId: project.id,
      id: randomUUID(),
      version,
      reviewStatus: "reviewed",
      recordedAt: new Date().toISOString(),
    };
    return (
      await write(
        "/api/v1/foundation/evaluations/assessments/review",
        reviewed,
        200,
      )
    ).record;
  }
  const motivationDefinition = await definition(
    "Synthetic motivating hard-gate failure",
    [baseline.id],
  );
  const failure = await assessment(
    motivationDefinition,
    "baseline",
    baseline,
    "fail",
  );
  const motivation = await review(failure);
  const comparisonDefinition = await definition(
    "Synthetic complete controlled regression",
    [baseline.id, candidate.id],
  );
  const assessments = [
    await assessment(comparisonDefinition, "baseline", baseline, "pass"),
    await assessment(comparisonDefinition, "candidate", candidate, "pass"),
  ];
  const conditionConfigurations = [
    {
      condition: "baseline",
      role: "baseline",
      configurationIds: [baseline.id],
    },
    {
      condition: "candidate",
      role: "candidate",
      configurationIds: [candidate.id],
    },
  ];
  return {
    baseline,
    candidate,
    judge,
    assessments,
    review,
    proposalInput: {
      candidateConfigurationId: candidate.id,
      baselineConfigurationId: baseline.id,
      definitionId: comparisonDefinition.id,
      motivations: [
        { assessmentId: motivation.id, assessmentVersion: motivation.version },
      ],
      conditionConfigurations,
      judgeConfigurationIds: [judge.id],
      rationale:
        "Synthetic reviewed hard-gate failure motivates a bounded configuration comparison.",
      hypothesis:
        "Synthetic candidate can be compared after every deterministic cell is reviewed.",
    },
    reportArgs: {
      definitionId: comparisonDefinition.id,
      conditionConfigurations: conditionConfigurations.map(
        ({ condition, configurationIds }) => ({ condition, configurationIds }),
      ),
      judgeConfigurationIds: [judge.id],
    },
  };
}

export async function foundationGovernedWorkflowSmoke({
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
  const transports = [];
  async function firstEffect(path, input, key = randomUUID()) {
    const result = await write(path, input, 200, key);
    assert.equal(
      result.replayed,
      false,
      "A fresh reviewed workflow must create its first effect",
    );
    return result;
  }
  async function scoped(operations, name) {
    const issued = await issue(operations, name);
    const client = await connect(issued.token);
    transports.push(client);
    return { issued, client };
  }
  const ownerHeaders = {
    cookie,
    origin: trustedOrigin,
    "content-type": "application/json",
  };
  async function get(path, status = 200, headers = ownerHeaders) {
    const response = await fetch(origin + path, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, status, await response.clone().text());
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  async function reviewDenials(path, body, token) {
    for (const [headers, input, status] of [
      [
        {
          ...ownerHeaders,
          origin: "https://untrusted.invalid",
          "idempotency-key": randomUUID(),
        },
        body,
        403,
      ],
      [
        { ...ownerHeaders, "idempotency-key": randomUUID() },
        { ...body, actor: "user:spoof" },
        400,
      ],
      [
        {
          authorization: `Bearer ${token}`,
          origin: trustedOrigin,
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        body,
        401,
      ],
      [
        { ...ownerHeaders, "idempotency-key": randomUUID() },
        { ...body, projectId: other.id },
        404,
      ],
    ]) {
      const response = await fetch(origin + path, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, status, await response.clone().text());
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
  async function privateRead(path, token) {
    await get(path, 401, {});
    await get(path, 401, { authorization: `Bearer ${token}` });
    await get(path.replace(project.id, other.id), 404);
    await get(path + "&projectId=" + project.id, 400);
    await get(path + "&actor=user:spoof", 400);
  }
  async function pages(client, name, expectedIds) {
    const seen = new Set();
    const cursors = new Set();
    let cursor;
    do {
      const page = await call(client, name, {
        limit: 1,
        ...(cursor ? { cursor } : {}),
      });
      assert.equal(page.projectId, project.id);
      for (const item of page.items) {
        assert.equal(
          seen.has(item.id),
          false,
          "Each proposal appears once across continuation",
        );
        seen.add(item.id);
      }
      cursor = page.nextCursor;
      if (cursor) {
        assert.equal(cursors.has(cursor), false, "Proposal cursor advances");
        cursors.add(cursor);
      }
    } while (cursor);
    for (const id of expectedIds) assert.equal(seen.has(id), true);
  }
  try {
    const allNames = Object.values(governedTools).flat().sort();
    const existingNames = (await existingClient.listTools()).tools.map(
      ({ name }) => name,
    );
    assert.equal(
      existingNames.some((name) => allNames.includes(name)),
      false,
    );
    for (const [operation, names] of Object.entries(governedTools)) {
      const { client } = await scoped(
        [operation],
        `Synthetic isolated ${operation}`,
      );
      assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name).sort(),
        [...names].sort(),
      );
    }
    const { client, issued } = await scoped(
      [
        ...Object.keys(governedTools),
        "foundation.read",
        "evidence.record",
        "configuration.record",
        "evaluation.record",
      ],
      "Synthetic governed workflow fixture",
    );
    assert.deepEqual(
      (await client.listTools()).tools
        .map(({ name }) => name)
        .filter((name) => allNames.includes(name))
        .sort(),
      allNames,
    );
    await assert.rejects(connect(issued.token, `/mcp/foundation/${other.id}`));
    const fixture = await createGovernedFindingFixture({
      client,
      call,
      write,
      project,
    });
    const findingInput = {
      originalContent:
        "\ufeff Synthetic <img src=x onerror=alert(1)>\r\ncafe\u0301 \ud83d\ude80",
      proposedTitle: "Synthetic governed finding",
      proposedBody: "Unverified cited finding; no instruction authority.",
      rationale: "Owner review of synthetic whole-source citations.",
      citations: [fixture.citation],
      idempotencyKey: randomUUID(),
    };
    const finding = (await call(client, "propose_finding", findingInput))
      .record;
    assert.equal(finding.status, "pending");
    assert.equal(finding.verification, "unverified");
    assert.equal(finding.projectId, project.id);
    assert.equal(finding.environment, environment);
    assert.equal(finding.clientId, issued.client.id);
    assert.equal(finding.sourceDigest, digest(findingInput.originalContent));
    const findingPath = `${workflowPath}/findings/by-capture/${finding.captureId}?projectId=${project.id}`;
    await privateRead(findingPath, issued.token);
    const pending = await get(findingPath);
    assert.equal(pending.capture.originalContent, findingInput.originalContent);
    assert.deepEqual(
      pending.suggestion.proposal.binding.citations,
      findingInput.citations,
    );
    assert.equal(
      pending.suggestion.proposal.binding.citationsDigest,
      finding.citationsDigest,
    );
    assert.equal(pending.decision, null);
    assert.deepEqual(
      await call(client, "get_finding", { id: finding.proposalId }),
      pending,
    );
    const suggestion = await get(
      `/api/v1/captures/${finding.captureId}/triage`,
    );
    assert.equal(
      JSON.stringify(suggestion).includes(
        '"ruleVersion":"agent-finding-proposal/v1"',
      ),
      true,
    );
    for (const kind of ["task", "note", "link", "document"]) {
      const denied = await write(
        `/api/v1/captures/${finding.captureId}/file`,
        {
          projectId: project.id,
          kind,
          title: "Bypass",
          body: "Synthetic bypass",
        },
        409,
      );
      assert.equal(denied.code, "CAPTURE_REVIEW_REQUIRED");
    }
    for (const [suffix, body] of [
      ["triage-suggestion", {}],
      ["triage", { decision: "reject" }],
    ]) {
      assert.equal(
        (
          await write(
            `/api/v1/captures/${finding.captureId}/${suffix}`,
            body,
            409,
          )
        ).code,
        "CAPTURE_REVIEW_REQUIRED",
      );
    }
    const badCitation = await client.callTool({
      name: "propose_finding",
      arguments: {
        ...findingInput,
        citations: [{ ...fixture.citation, contentDigest: "0".repeat(64) }],
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(badCitation.isError, true);
    const findingReview = {
      projectId: project.id,
      proposalId: finding.proposalId,
      expectedVersion: 1,
      expectedProposalDigest: finding.proposalDigest,
      expectedSourceDigest: finding.sourceDigest,
      expectedCitationsDigest: finding.citationsDigest,
      decision: "approve",
      selectedTitle: "Owner selected synthetic finding",
      selectedBody: "Owner selected unverified finding.\r\nExact cafe\u0301.",
      reason: "Reviewed original bytes and citation bindings only.",
    };
    const findingReviewPath = `${workflowPath}/findings/review`;
    await reviewDenials(findingReviewPath, findingReview, issued.token);
    await write(
      findingReviewPath,
      { ...findingReview, expectedCitationsDigest: "0".repeat(64) },
      409,
    );
    const findingKey = randomUUID();
    const approved = await firstEffect(
      findingReviewPath,
      findingReview,
      findingKey,
    );
    assert.equal(approved.record.knowledge.title, findingReview.selectedTitle);
    assert.equal(approved.record.knowledge.content, findingReview.selectedBody);
    assert.equal(approved.record.knowledge.sourceCaptureId, finding.captureId);
    assert.equal(
      approved.record.memory.knowledgeItemId,
      approved.record.knowledge.id,
    );
    assert.equal(approved.record.memory.lifecycle, "proposed");
    assert.equal(approved.record.memory.verification, "unverified");
    assert.equal(approved.record.memory.content.category, "finding");
    const [anchorId, ...citationIds] =
      approved.record.memory.content.evidenceIds;
    assert.ok(anchorId);
    assert.notEqual(anchorId, fixture.evidence.id);
    assert.deepEqual(citationIds, [fixture.evidence.id]);
    const anchor = await call(client, "get_foundation_evidence", {
      id: anchorId,
    });
    assert.equal(anchor.sourceKind, "knowledge_revision");
    assert.equal(anchor.sourceId, approved.record.knowledge.id);
    assert.equal(anchor.sourceVersion, "1");
    assert.equal(anchor.contentDigest, digest(findingReview.selectedBody));
    assert.equal(anchor.verification, "unverified");
    assert.match(approved.record.decision.actor, /^user:/);
    const approvedReplay = await write(
      findingReviewPath,
      findingReview,
      200,
      findingKey,
    );
    assert.equal(approvedReplay.replayed, true);
    assert.deepEqual(approvedReplay, { ...approved, replayed: true });
    const filed = await get(findingPath);
    assert.equal(filed.capture.originalContent, findingInput.originalContent);
    assert.equal(filed.capture.filedRecord.id, approved.record.knowledge.id);
    const historical = await call(client, "propose_finding", findingInput);
    assert.equal(historical.replayed, true);
    assert.deepEqual(historical.record, finding);
    const rejectedFinding = (
      await call(client, "propose_finding", {
        ...findingInput,
        proposedTitle: "Reject synthetic finding",
        idempotencyKey: randomUUID(),
      })
    ).record;
    const rejected = await firstEffect(findingReviewPath, {
      projectId: project.id,
      proposalId: rejectedFinding.proposalId,
      expectedVersion: 1,
      expectedProposalDigest: rejectedFinding.proposalDigest,
      expectedSourceDigest: rejectedFinding.sourceDigest,
      expectedCitationsDigest: rejectedFinding.citationsDigest,
      decision: "reject",
      reason: "Keep the original; reject this proposed interpretation.",
    });
    assert.equal(rejected.record.knowledge, null);
    assert.equal(rejected.record.memory, null);
    assert.equal(
      (
        await get(
          `${workflowPath}/findings/${rejectedFinding.proposalId}?projectId=${project.id}`,
        )
      ).capture.state,
      "unfiled",
    );

    const onboardingInput = {
      ...governedOnboardingInput(fixture.evidence.id),
      idempotencyKey: randomUUID(),
    };
    const onboarding = (
      await call(client, "propose_host_onboarding", onboardingInput)
    ).record;
    const onboardingPath = `${workflowPath}/onboarding/${onboarding.id}?projectId=${project.id}`;
    await privateRead(onboardingPath, issued.token);
    const before = await get(onboardingPath);
    assert.equal(before.currentDecision, null);
    assert.equal(before.outcome, null);
    const preview = await get(
      `${workflowPath}/onboarding/${onboarding.id}/preview?projectId=${project.id}`,
    );
    assert.equal(preview.canApply, true);
    assert.equal(preview.preconditions.resource, null);
    const onboardingReview = {
      projectId: project.id,
      proposalId: onboarding.id,
      expectedProposalDigest: onboarding.contentDigest,
      expectedPreviewDigest: preview.previewDigest,
      expectedDecisionVersion: 0,
      decision: "approved",
      reason: "Owner inspected this exact synthetic inventory and connection.",
      expiresAt: expiresAt(),
      inventoryReviewed: true,
    };
    const onboardingReviewPath = `${workflowPath}/onboarding/review`;
    await reviewDenials(onboardingReviewPath, onboardingReview, issued.token);
    await write(
      onboardingReviewPath,
      { ...onboardingReview, inventoryReviewed: false },
      400,
    );
    await write(
      onboardingReviewPath,
      { ...onboardingReview, expectedPreviewDigest: "0".repeat(64) },
      409,
    );
    const decisionKey = randomUUID();
    const decision = (
      await firstEffect(onboardingReviewPath, onboardingReview, decisionKey)
    ).record;
    assert.equal(
      (await get(onboardingPath)).outcome,
      null,
      "Owner approval must not apply inventory",
    );
    const apply = {
      projectId: project.id,
      proposalId: onboarding.id,
      expectedProposalDigest: onboarding.contentDigest,
      decisionId: decision.id,
      expectedDecisionVersion: decision.version,
      expectedDecisionDigest: decision.contentDigest,
    };
    const applyPath = `${workflowPath}/onboarding/apply`;
    await reviewDenials(applyPath, apply, issued.token);
    await write(
      applyPath,
      { ...apply, expectedDecisionDigest: "0".repeat(64) },
      409,
    );
    const applyKey = randomUUID();
    const applied = await firstEffect(applyPath, apply, applyKey);
    assert.equal(applied.record.resourceCreated, true);
    assert.equal(applied.record.linkCreated, true);
    assert.equal(applied.record.resource.kind, "host");
    assert.equal(applied.record.resource.name, onboardingInput.target.name);
    assert.equal(applied.record.link.projectId, project.id);
    assert.equal(applied.record.link.resourceId, applied.record.resource.id);
    assert.deepEqual((await get(onboardingPath)).outcome, applied.record);
    const machine = await call(client, "get_host_onboarding", {
      id: onboarding.id,
    });
    assert.equal(machine.outcome.resourceId, applied.record.resource.id);
    assert.deepEqual(
      Object.keys(machine.currentDecision).sort(),
      ["id", "version", "decision", "expiresAt"].sort(),
    );
    assert.equal(Object.hasOwn(machine, "preconditions"), false);
    assert.equal(
      JSON.stringify(machine).includes(onboardingReview.reason),
      false,
    );
    const reuseInput = {
      target: { mode: "reuse", resourceId: applied.record.resource.id },
      relationship: "supports",
      rationale:
        "Reuse explicitly selected canonical host without changing it.",
      evidenceIds: [fixture.evidence.id],
      idempotencyKey: randomUUID(),
    };
    const reuse = (await call(client, "propose_host_onboarding", reuseInput))
      .record;
    const reusePreview = await get(
      `${workflowPath}/onboarding/${reuse.id}/preview?projectId=${project.id}`,
    );
    assert.equal(reusePreview.canApply, true);
    assert.equal(
      reusePreview.preconditions.resource.id,
      applied.record.resource.id,
    );
    assert.equal(reusePreview.preconditions.link.id, applied.record.link.id);
    const reuseDecision = (
      await firstEffect(onboardingReviewPath, {
        ...onboardingReview,
        proposalId: reuse.id,
        expectedProposalDigest: reuse.contentDigest,
        expectedPreviewDigest: reusePreview.previewDigest,
        reason: "Owner reviewed reuse of the selected canonical host.",
      })
    ).record;
    const reused = (
      await firstEffect(applyPath, {
        projectId: project.id,
        proposalId: reuse.id,
        expectedProposalDigest: reuse.contentDigest,
        decisionId: reuseDecision.id,
        expectedDecisionVersion: reuseDecision.version,
        expectedDecisionDigest: reuseDecision.contentDigest,
      })
    ).record;
    assert.equal(reused.resourceCreated, false);
    assert.equal(reused.linkCreated, false);
    assert.deepEqual(reused.resource, applied.record.resource);
    assert.deepEqual(reused.link, applied.record.link);
    const applyReplay = await write(applyPath, apply, 200, applyKey);
    assert.equal(applyReplay.replayed, true);
    assert.deepEqual(applyReplay.record, applied.record);
    assert.deepEqual(
      (await write(onboardingReviewPath, onboardingReview, 200, decisionKey))
        .record,
      decision,
    );
    assert.deepEqual(
      (await call(client, "propose_host_onboarding", onboardingInput)).record,
      onboarding,
    );
    await pages(client, "list_host_onboardings", [onboarding.id, reuse.id]);
    const forgedInventory = await client.callTool({
      name: "list_host_onboardings",
      arguments: { projectId: other.id },
    });
    assert.equal(forgedInventory.isError, true);

    const improvementFixture = await createGovernedImprovementFixture({
      client,
      call,
      write,
      project,
    });
    const improvementInput = {
      ...improvementFixture.proposalInput,
      idempotencyKey: randomUUID(),
    };
    const improvement = (
      await call(client, "propose_improvement", improvementInput)
    ).record;
    const improvementPath = `${workflowPath}/improvements/${improvement.id}?projectId=${project.id}`;
    await privateRead(improvementPath, issued.token);
    const blocked = await get(improvementPath);
    assert.equal(blocked.advisory.eligibleForReview, false);
    assert.ok(
      blocked.advisory.comparisons.some(
        ({ counts }) => counts.unassessedCells > 0,
      ),
    );
    function improvementReview(detail, decision = "accepted") {
      return {
        projectId: project.id,
        proposalId: improvement.id,
        expectedProposalDigest: improvement.contentDigest,
        expectedPopulationDigest: detail.advisory.populationDigest,
        expectedReportDigest: detail.advisory.reportDigest,
        expectedDecisionVersion: detail.currentDecision?.version ?? 0,
        decision,
        reason:
          "Owner reviewed every synthetic regression cell. No configuration adoption.",
        expiresAt: expiresAt(),
      };
    }
    const improvementReviewPath = `${workflowPath}/improvements/review`;
    assert.equal(
      (await write(improvementReviewPath, improvementReview(blocked), 403))
        .code,
      "APPROVAL_REQUIRED",
    );
    const reviewed = [];
    for (const assessment of improvementFixture.assessments)
      reviewed.push(await improvementFixture.review(assessment));
    const report = await call(
      client,
      "get_evaluation_report",
      improvementFixture.reportArgs,
    );
    assert.equal(report.eligibleForReview, true);
    assert.equal(report.expectedCellsPerComparison, 2);
    assert.equal(report.comparisons[0].counts.passedCells, 2);
    const eligible = await call(client, "get_improvement", {
      id: improvement.id,
    });
    assert.equal(eligible.advisory.eligibleForReview, true);
    assert.equal(eligible.advisory.pendingNewerAssessmentCount, 0);
    assert.deepEqual(eligible.advisory.blockers, []);
    const improvementDecision = improvementReview(eligible);
    await reviewDenials(
      improvementReviewPath,
      improvementDecision,
      issued.token,
    );
    const improvementKey = randomUUID();
    const accepted = await firstEffect(
      improvementReviewPath,
      improvementDecision,
      improvementKey,
    );
    assert.equal(accepted.record.decision, "accepted");
    assert.equal(
      accepted.record.expectedPopulationDigest,
      eligible.advisory.populationDigest,
    );
    assert.equal(
      accepted.record.expectedReportDigest,
      eligible.advisory.reportDigest,
    );
    assert.equal(
      (
        await call(client, "get_configuration_version", {
          id: improvementFixture.candidate.id,
        })
      ).contentDigest,
      improvementFixture.candidate.contentDigest,
    );
    const newer = {
      ...improvementFixture.assessments[0],
      id: randomUUID(),
      version: reviewed[0].version + 1,
      reviewStatus: "unreviewed",
      recordedAt: new Date().toISOString(),
    };
    await call(client, "record_evaluation_assessment", {
      ...newer,
      idempotencyKey: randomUUID(),
    });
    const pendingNewer = await get(improvementPath);
    assert.equal(pendingNewer.advisory.eligibleForReview, false);
    assert.ok(pendingNewer.advisory.pendingNewerAssessmentCount > 0);
    assert.equal(
      (await write(improvementReviewPath, improvementReview(pendingNewer), 403))
        .code,
      "APPROVAL_REQUIRED",
    );
    const acceptedReplay = await write(
      improvementReviewPath,
      improvementDecision,
      200,
      improvementKey,
    );
    assert.equal(acceptedReplay.replayed, true);
    assert.deepEqual(acceptedReplay.record, accepted.record);
    const improvementHistory = await call(
      client,
      "propose_improvement",
      improvementInput,
    );
    assert.equal(improvementHistory.replayed, true);
    assert.deepEqual(improvementHistory.record, improvement);
    await pages(client, "list_improvements", [improvement.id]);
    console.log(
      `Governed SDK/HTTP rehearsal passed (${environment}): eight exact scoped tools, citation-bound findings, owner filing with proposed/unverified assertions, inventory preview/review/separate create and reuse apply, complete reviewed synthetic comparison, pending-newer refusal and historical retries. No inference, adoption or deployment occurred.`,
    );
  } finally {
    await Promise.allSettled(transports.map((client) => client.close()));
  }
}
