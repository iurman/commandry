import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq, sql } from "drizzle-orm";
import { foundationClient } from "./foundation-schema";
import {
  createFoundationMachineService,
  createFoundationOwnerService,
  createFoundationEvaluationService,
  createFoundationEvaluationOwnerService,
  createFoundationImprovementService,
  type FoundationImprovementRecords,
  type FoundationOwnerRequest,
} from "@commandry/application";
import {
  foundationImprovementProposalSchema,
  foundationImprovementDecisionSchema,
} from "@commandry/contracts";
import type {
  FoundationAssessment,
  FoundationEvaluationDefinition,
  FoundationEvaluationTrial,
  FoundationImprovementDecision,
  FoundationImprovementInput,
  FoundationImprovementProposal,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationEvaluationAccessRepository } from "./foundation-evaluation-access-repository";
import { createFoundationImprovementAccessRepository } from "./foundation-improvement-repository";
import { foundationByteDigest } from "./foundation-record-repository";
import {
  foundationImprovementProposal as proposalTable,
  foundationImprovementConditionConfiguration as conditionTable,
  foundationImprovementJudgeConfiguration as judgeTable,
  foundationImprovementMotivation as motivationTable,
  foundationImprovementDecision as decisionTable,
} from "./foundation-improvement-schema";
import { project, session, user } from "./schema";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;
const denied =
  (...codes: string[]) =>
  (error: unknown) =>
    error instanceof FoundationError && codes.includes(error.code);
const checkedDigest = <T extends { contentDigest: string }>(record: T) => {
  const { contentDigest, ...content } = record;
  assert.equal(contentDigest, foundationDigest(content));
};
const digestRecord = <T extends object>(record: T) => ({
  ...record,
  contentDigest: foundationDigest(record),
});
const migration = new URL(
  "../migrations/0065_foundation_improvement.sql",
  import.meta.url,
);

before(async () => {
  const admin = createDatabase({ connectionString: adminUrl!, max: 1 });
  try {
    const statements = (await readFile(migration, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim());
    for (let repeat = 0; repeat < 2; repeat++)
      await admin.db.transaction(async (tx) => {
        for (const statement of statements)
          await tx.execute(sql.raw(statement));
      });
  } finally {
    await admin.close();
  }
});

async function fixture() {
  const admin = createDatabase({ connectionString: adminUrl!, max: 4 });
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const otherRuntime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const projectId = randomUUID(),
    foreignProjectId = randomUUID(),
    userId = randomUUID(),
    sessionId = randomUUID();
  await admin.db.insert(project).values([
    { id: projectId, name: "Deterministic improvement persistence" },
    { id: foreignProjectId, name: "Foreign improvement scope" },
  ]);
  await admin.db.insert(user).values({
    id: userId,
    name: "Disposable improvement owner",
    email: "improvement-" + userId + "@example.test",
  });
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  await admin.db.insert(session).values({
    id: sessionId,
    userId,
    token: "disposable-" + randomUUID(),
    expiresAt: new Date(expiresAt),
  });
  const identity = { principalId: "user:" + userId, sessionId, expiresAt };
  const owner = createFoundationOwnerService(
    createFoundationAccessRepository(runtime.db),
    identity,
    { environment: "test" },
  );
  const grant = await owner.createClient(
    {
      name: "Scoped deterministic improvement fixture",
      projectId,
      environment: "test",
      operations: [
        "foundation.read",
        "configuration.record",
        "evaluation.record",
        "improvement.read",
        "improvement.propose",
      ],
      ttlSeconds: 3600,
    },
    "fixture-grant",
  );
  const core = createFoundationMachineService(
    createFoundationAccessRepository(runtime.db),
    { environment: "test" },
  );
  const configuration = async (
    name: string,
    kind: "prompt" | "runtime" | "settings" | "model",
    parentIds: string[] = [],
  ) =>
    (
      await core.recordConfiguration(
        grant.token,
        {
          projectId,
          kind,
          content: "Deterministic fixture " + name,
          parentIds,
          sourceCommit: null,
        },
        name,
      )
    ).record;
  const baseline = await configuration("baseline", "prompt");
  const candidate = await configuration("candidate", "prompt", [baseline.id]);
  const shared = await configuration("shared-runtime", "runtime");
  const settings = await configuration("shared-settings", "settings");
  const judge = await configuration("judge-observation-only", "model");
  const evaluationPort = createFoundationEvaluationAccessRepository(runtime.db);
  const evaluation = createFoundationEvaluationService(evaluationPort, {
    environment: "test",
  });
  const evaluationOwner = createFoundationEvaluationOwnerService(
    evaluationPort,
    identity,
    { environment: "test" },
  );
  const definition = (historical: boolean): FoundationEvaluationDefinition => ({
    schemaVersion: 1,
    id: randomUUID(),
    projectId,
    version: 1,
    name: historical
      ? "Historical observed failure"
      : "Current controlled regression",
    configurationIds: historical
      ? [baseline.id, shared.id, settings.id]
      : [baseline.id, candidate.id, shared.id, settings.id],
    cases: [
      {
        id: "fixture",
        fixtureDigest: foundationByteDigest("fixture"),
        rubricDigest: foundationByteDigest("rubric"),
        hardGates: ["scope"],
      },
    ],
    conditions: historical ? ["historical"] : ["baseline", "candidate"],
    repetitions: 1,
    disclosure: "local_only",
  });
  const historicalDefinition = definition(true),
    currentDefinition = definition(false);
  await evaluation.recordDefinition(
    grant.token,
    historicalDefinition,
    "historical-definition",
  );
  await evaluation.recordDefinition(
    grant.token,
    currentDefinition,
    "current-definition",
  );
  const makeTrial = (
    definition: FoundationEvaluationDefinition,
    condition: string,
    configurationIds: string[],
  ): FoundationEvaluationTrial => ({
    schemaVersion: 1,
    id: randomUUID(),
    attemptId: randomUUID(),
    projectId,
    definitionId: definition.id,
    caseId: "fixture",
    condition,
    repetition: 1,
    configurationIds,
    model: "deterministic-fixture",
    runtime: "no-model-execution",
    inputDigest: definition.cases[0]!.fixtureDigest,
    artifactDigests: [foundationByteDigest(randomUUID())],
    outcome: "completed",
    usage: { inputTokens: null, outputTokens: null },
    recordedAt: new Date().toISOString(),
  });
  const assess = async (
    trial: FoundationEvaluationTrial,
    fail: boolean,
    suffix: string,
    reviewed = true,
  ) => {
    const unreviewed: FoundationAssessment = {
      schemaVersion: 1,
      id: randomUUID(),
      trialId: trial.id,
      projectId,
      version: 1,
      trialArtifactDigest: trial.artifactDigests[0]!,
      rubricDigest: currentDefinition.cases[0]!.rubricDigest,
      judgeConfigurationId: judge.id,
      checks: [{ id: "scope", result: fail ? "fail" : "pass", hardGate: true }],
      uncertainty:
        "Deterministic fixture observations are not model performance",
      reviewStatus: "unreviewed",
      recordedAt: new Date().toISOString(),
    };
    await evaluation.recordAssessment(
      grant.token,
      unreviewed,
      suffix + ":unreviewed",
    );
    if (!reviewed) return unreviewed;
    return (
      await evaluationOwner.reviewAssessment(
        {
          ...unreviewed,
          id: randomUUID(),
          version: 2,
          reviewStatus: "reviewed",
          recordedAt: new Date().toISOString(),
        },
        suffix + ":reviewed",
      )
    ).record;
  };
  const historicalTrial = makeTrial(historicalDefinition, "historical", [
    baseline.id,
    shared.id,
    settings.id,
  ]);
  await evaluation.recordTrial(
    grant.token,
    historicalTrial,
    "historical-trial",
  );
  const motivation = await assess(historicalTrial, true, "historical-failure");
  const currentTrials = [];
  for (const condition of ["baseline", "candidate"]) {
    const trial = makeTrial(currentDefinition, condition, [
      condition === "baseline" ? baseline.id : candidate.id,
      shared.id,
      settings.id,
    ]);
    await evaluation.recordTrial(
      grant.token,
      trial,
      "current-trial:" + condition,
    );
    await assess(trial, false, "current-assessment:" + condition);
    currentTrials.push(trial);
  }
  const port = createFoundationImprovementAccessRepository(runtime.db);
  const improvement = createFoundationImprovementService(port, {
    environment: "test",
  });
  const parallel = createFoundationImprovementService(
    createFoundationImprovementAccessRepository(otherRuntime.db),
    { environment: "test" },
  );
  const input: FoundationImprovementInput = {
    projectId,
    definitionId: currentDefinition.id,
    baselineConfigurationId: baseline.id,
    candidateConfigurationId: candidate.id,
    motivations: [
      { assessmentId: motivation.id, assessmentVersion: motivation.version },
    ],
    conditionConfigurations: [
      {
        condition: "baseline",
        role: "baseline",
        configurationIds: [baseline.id, shared.id, settings.id],
      },
      {
        condition: "candidate",
        role: "candidate",
        configurationIds: [candidate.id, shared.id, settings.id],
      },
    ],
    judgeConfigurationIds: [judge.id],
    rationale: "Observed historical scope failure",
    hypothesis: "Candidate preserves current deterministic regression gates",
  };
  const ownerRequest = (
    operation: FoundationOwnerRequest["operation"],
    targetId: string | null,
  ): FoundationOwnerRequest => ({
    ...identity,
    operation,
    projectId,
    environment: "test",
    correlationId: randomUUID(),
    targetId,
  });
  const detail = (id: string) =>
    improvement.get(grant.token, { projectId, id });
  const reviewInput = async (
    id: string,
    decision: "accepted" | "rejected" | "revoked" = "accepted",
    expiry = new Date(Date.now() + 60000).toISOString(),
  ) => {
    const current = await detail(id);
    return {
      projectId,
      proposalId: id,
      expectedProposalDigest: current.proposal.contentDigest,
      expectedPopulationDigest: current.advisory.populationDigest,
      expectedReportDigest: current.advisory.reportDigest,
      expectedDecisionVersion: current.currentDecision?.version ?? 0,
      decision,
      reason: "Owner reviewed deterministic fixture observations",
      expiresAt: expiry,
    };
  };
  const counts = async () => {
    const result = await admin.db.execute(sql`select
      (select count(*)::int from foundation_improvement_proposal where project_id=${projectId}) as proposals,
      (select count(*)::int from foundation_improvement_condition_configuration where project_id=${projectId}) as conditions,
      (select count(*)::int from foundation_improvement_judge_configuration where project_id=${projectId}) as judges,
      (select count(*)::int from foundation_improvement_motivation where project_id=${projectId}) as motivations,
      (select count(*)::int from foundation_improvement_decision where project_id=${projectId}) as decisions,
      (select count(*)::int from foundation_idempotency where project_id=${projectId} and operation in ('improvement.propose','improvement.review')) as receipts,
      (select count(*)::int from foundation_audit where project_id=${projectId} and operation in ('improvement.propose','improvement.review') and decision='allowed') as allowed`);
    return result.rows[0];
  };
  return {
    admin,
    runtime,
    otherRuntime,
    owner,
    grant,
    identity,
    projectId,
    foreignProjectId,
    sessionId,
    userId,
    baseline,
    candidate,
    shared,
    settings,
    judge,
    evaluation,
    evaluationOwner,
    currentDefinition,
    currentTrials,
    historicalDefinition,
    historicalTrial,
    motivation,
    assess,
    makeTrial,
    input,
    port,
    improvement,
    parallel,
    ownerRequest,
    detail,
    reviewInput,
    counts,
    close: async () => {
      await otherRuntime.close();
      await runtime.close();
      await admin.close();
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Tx = Parameters<Parameters<Fixture["admin"]["db"]["transaction"]>[0]>[0];

function proposalContent(
  record: FoundationImprovementProposal,
  changes: Partial<FoundationImprovementProposal> = {},
) {
  const { contentDigest: _digest, ...content } = { ...record, ...changes };
  return digestRecord(content);
}
async function insertRawProposal(
  tx: Tx,
  record: FoundationImprovementProposal,
  options: {
    omit?: "conditions" | "judges" | "motivations";
    extra?: boolean;
    wrongVersion?: boolean;
    wrongProject?: string;
    forgedCreation?: string;
    reordered?: boolean;
  } = {},
) {
  await tx.insert(proposalTable).values({
    id: record.id,
    projectId: record.projectId,
    environment: record.environment,
    definitionId: record.definitionId,
    candidateConfigurationId: record.candidateConfigurationId,
    baselineConfigurationId: record.baselineConfigurationId,
    record,
    ...(options.forgedCreation === undefined
      ? {}
      : { creationTransaction: options.forgedCreation }),
  });
  if (options.omit !== "conditions")
    await tx.insert(conditionTable).values(
      record.conditionConfigurations.flatMap((c, conditionOrdinal) =>
        c.configurationIds.map((configurationId, ordinal) => ({
          proposalId: record.id,
          projectId: options.wrongProject ?? record.projectId,
          conditionOrdinal,
          condition: c.condition,
          role: c.role,
          configurationId,
          ordinal: options.reordered
            ? c.configurationIds.length - ordinal - 1
            : ordinal,
        })),
      ),
    );
  if (options.omit !== "judges")
    await tx.insert(judgeTable).values(
      record.judgeConfigurationIds.map((configurationId, ordinal) => ({
        proposalId: record.id,
        projectId: record.projectId,
        configurationId,
        ordinal,
      })),
    );
  if (options.omit !== "motivations")
    await tx.insert(motivationTable).values(
      record.motivations.map((m, ordinal) => ({
        proposalId: record.id,
        projectId: record.projectId,
        assessmentId: m.assessmentId,
        assessmentVersion: options.wrongVersion
          ? m.assessmentVersion + 1
          : m.assessmentVersion,
        ordinal,
      })),
    );
  if (options.extra)
    await tx.insert(judgeTable).values({
      proposalId: record.id,
      projectId: record.projectId,
      configurationId: record.baselineConfigurationId,
      ordinal: record.judgeConfigurationIds.length,
    });
}

test("canonical SQL digest preserves JSON encoding, UTF16 object order and safe integers", async () => {
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  try {
    for (const value of [
      null,
      true,
      false,
      "",
      'quote" backslash\\\n\t\b\f\r' + String.fromCharCode(1),
      "astral \u{1f600} and \u2028\u2029",
      [-0, 1, -1, 9007199254740991, -9007199254740991],
      { "\ue000": 1, "\u{10000}": 2, a: ["value", null, { z: 0, a: true }] },
    ]) {
      const result = await runtime.db.execute(
        sql`select public.commandry_improvement_canonical_json(${JSON.stringify(value)}::jsonb) as canonical, public.commandry_improvement_digest(${JSON.stringify(value)}::jsonb) as digest`,
      );
      assert.equal(result.rows[0]!.canonical, canonicalFoundationJson(value));
      assert.equal(result.rows[0]!.digest, foundationDigest(value));
    }
    for (const number of [
      "9007199254740992",
      "-9007199254740992",
      "1.25",
      "1e100",
    ])
      await assert.rejects(
        runtime.db.execute(
          sql`select public.commandry_improvement_canonical_json(${number}::jsonb)`,
        ),
      );
    const boundary = await runtime.db.execute(
      sql`select public.commandry_improvement_instant_compare('2026-10-16T00:00:00.0000001Z','2026-10-16T01:00:00.000+01:00') as comparison`,
    );
    assert.equal(boundary.rows[0]!.comparison, 1);
  } finally {
    await runtime.close();
  }
});

test(
  "actual application proposals, exact replay, historical motivations and immutable versioned owner decisions",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const created = await f.improvement.propose(
        f.grant.token,
        "first-proposal",
        f.input,
      );
      checkedDigest(created.record);
      assert.equal(created.replayed, false);
      const replay = await f.improvement.propose(
        f.grant.token,
        "first-proposal",
        f.input,
      );
      assert.deepEqual(replay, { ...created, replayed: true });
      const snapshot = await f.detail(created.record.id);
      assert.equal(snapshot.advisory.eligibleForReview, true);
      assert.equal(snapshot.advisory.comparisons[0]!.counts.expectedCells, 2);
      assert.equal(snapshot.advisory.comparisons[0]!.counts.passedCells, 2);
      assert.equal(snapshot.currentDecision, null);
      assert.equal(f.motivation.reviewStatus, "reviewed");
      assert.equal(f.motivation.checks[0]!.result, "fail");
      assert.notEqual(f.historicalDefinition.id, created.record.definitionId);
      for (const decision of ["accepted", "rejected", "revoked"] as const) {
        const input = await f.reviewInput(created.record.id, decision);
        const reviewed = await f.improvement.review(
          f.identity,
          "decision:" + decision,
          input,
        );
        checkedDigest(reviewed.record);
        assert.equal(
          reviewed.record.version,
          input.expectedDecisionVersion + 1,
        );
        assert.equal(reviewed.record.decision, decision);
        assert.equal(reviewed.record.recordedBy, f.identity.principalId);
        const retry = await f.improvement.review(
          f.identity,
          "decision:" + decision,
          input,
        );
        assert.deepEqual(retry, { ...reviewed, replayed: true });
      }
      const before = await f.counts();
      await assert.rejects(
        f.improvement.propose(f.grant.token, "first-proposal", {
          ...f.input,
          hypothesis: "Different input",
        }),
        denied("IDEMPOTENCY_CONFLICT"),
      );
      assert.deepEqual(await f.counts(), before);
      const prior = await f.detail(created.record.id);
      const staleReview = await f.reviewInput(created.record.id);
      const trial = f.currentTrials[0]!;
      await f.evaluation.recordAssessment(
        f.grant.token,
        {
          schemaVersion: 1,
          id: randomUUID(),
          trialId: trial.id,
          projectId: f.projectId,
          version: 3,
          trialArtifactDigest: trial.artifactDigests[0]!,
          rubricDigest: f.currentDefinition.cases[0]!.rubricDigest,
          judgeConfigurationId: f.judge.id,
          checks: [{ id: "scope", result: "pass", hardGate: true }],
          uncertainty: "New deterministic observation awaiting owner review",
          reviewStatus: "unreviewed",
          recordedAt: new Date().toISOString(),
        },
        "pending-newer-assessment",
      );
      const updated = await f.detail(created.record.id);
      assert.notEqual(
        updated.advisory.populationDigest,
        prior.advisory.populationDigest,
      );
      assert.notEqual(
        updated.advisory.reportDigest,
        prior.advisory.reportDigest,
      );
      assert.ok(updated.advisory.pendingNewerAssessmentCount > 0);
      assert.deepEqual(updated.currentDecision, prior.currentDecision);
      await assert.rejects(
        f.improvement.review(f.identity, "stale-population", staleReview),
        denied("VERSION_CONFLICT"),
      );
      assert.deepEqual(
        (await f.improvement.propose(f.grant.token, "first-proposal", f.input))
          .record,
        created.record,
      );
      const additionalTrial = f.makeTrial(f.currentDefinition, "baseline", [
        f.baseline.id,
        f.shared.id,
        f.settings.id,
      ]);
      await f.evaluation.recordTrial(
        f.grant.token,
        additionalTrial,
        "new-attempt",
      );
      const afterAttempt = await f.detail(created.record.id);
      assert.notEqual(
        afterAttempt.advisory.populationDigest,
        updated.advisory.populationDigest,
      );
      assert.equal(afterAttempt.advisory.eligibleForReview, false);
      assert.deepEqual(afterAttempt.currentDecision, prior.currentDecision);
    } finally {
      await f.close();
    }
  },
);

test(
  "proposal pagination reaches all rows and validates scope, future and missing continuation anchors",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const records: FoundationImprovementProposal[] = [];
      for (let i = 0; i < 29; i++)
        records.push(
          (
            await f.improvement.propose(f.grant.token, "page:" + i, {
              ...f.input,
              rationale: "Deterministic pagination " + i,
            })
          ).record,
        );
      let cursor: string | undefined;
      const seen: string[] = [];
      do {
        const page = await f.improvement.list(f.grant.token, {
          projectId: f.projectId,
          limit: 7,
          ...(cursor ? { cursor } : {}),
        });
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.deepEqual(seen, records.map((r) => r.id).sort());
      const query = {
        limit: 5,
        asOf: new Date().toISOString(),
        afterId: randomUUID(),
      };
      for (const afterId of [query.afterId, records[0]!.id]) {
        const asOf =
          afterId === query.afterId ? query.asOf : "2000-01-01T00:00:00.000Z";
        await assert.rejects(
          f.port.withOwner(f.ownerRequest("improvement.read", null), (r) =>
            r.listProposals({ ...query, afterId, asOf }),
          ),
          denied("INVALID_REFERENCE"),
        );
      }
      // An actual foreign proposal requires foreign canonical references, so use
      // the existing proposal as an anchor under a different authorized project.
      await assert.rejects(
        f.port.withOwner(
          {
            ...f.ownerRequest("improvement.read", null),
            projectId: f.foreignProjectId,
          },
          (r) =>
            r.listProposals({
              limit: 7,
              asOf: query.asOf,
              afterId: records[0]!.id,
            }),
        ),
        denied("INVALID_REFERENCE"),
      );
      const cutoff = records[0]!.recordedAt;
      const precision = proposalContent(records[0]!, {
        id: randomUUID(),
        recordedAt: cutoff.replace(/\.(\d{3})Z$/, ".$10001Z"),
      });
      await f.runtime.db.transaction((tx) => insertRawProposal(tx, precision));
      const page = await f.port.withOwner(
        f.ownerRequest("improvement.read", null),
        (r) => r.listProposals({ limit: 100, afterId: null, asOf: cutoff }),
      );
      assert.ok(!page.items.some((row) => row.id === precision.id));
      await assert.rejects(
        f.port.withOwner(f.ownerRequest("improvement.read", null), (r) =>
          r.listProposals({ limit: 100, afterId: precision.id, asOf: cutoff }),
        ),
        denied("INVALID_REFERENCE"),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "real SQL rejects incomplete, foreign, reordered and immutable populations without orphan rows",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const original = (
        await f.improvement.propose(f.grant.token, "sql-reference", f.input)
      ).record;
      const initial = await f.counts();
      for (const options of [
        { omit: "conditions" },
        { omit: "judges" },
        { omit: "motivations" },
        { extra: true },
        { wrongVersion: true },
        { wrongProject: f.foreignProjectId },
        { reordered: true },
      ] as const) {
        const record = proposalContent(original, { id: randomUUID() });
        await assert.rejects(
          f.runtime.db.transaction((tx) =>
            insertRawProposal(tx, record, options),
          ),
        );
        assert.deepEqual(await f.counts(), initial);
      }
      for (const change of [
        { record: { ...original, contentDigest: "0".repeat(64) } },
        { id: randomUUID(), record: original },
      ])
        await assert.rejects(
          f.runtime.db.insert(proposalTable).values({
            id: original.id,
            projectId: f.projectId,
            environment: "test",
            definitionId: original.definitionId,
            candidateConfigurationId: original.candidateConfigurationId,
            baselineConfigurationId: original.baselineConfigurationId,
            ...change,
          }),
        );
      for (const table of [
        proposalTable,
        conditionTable,
        judgeTable,
        motivationTable,
      ]) {
        await assert.rejects(
          f.runtime.db.execute(
            sql`update ${table} set project_id=project_id where project_id=${f.projectId}`,
          ),
        );
        await assert.rejects(
          f.runtime.db.execute(
            sql`delete from ${table} where project_id=${f.projectId}`,
          ),
        );
      }
      await assert.rejects(
        f.runtime.db.insert(judgeTable).values({
          proposalId: original.id,
          projectId: f.projectId,
          configurationId: f.baseline.id,
          ordinal: 1,
        }),
      );
      const forged = proposalContent(original, { id: randomUUID() });
      await f.runtime.db.transaction((tx) =>
        insertRawProposal(tx, forged, {
          forgedCreation: "forged-future-transaction",
        }),
      );
      const transaction = await f.runtime.db.execute(
        sql`select creation_transaction from foundation_improvement_proposal where id=${forged.id}`,
      );
      assert.notEqual(
        transaction.rows[0]!.creation_transaction,
        "forged-future-transaction",
      );
      // A TEMP table with the canonical name cannot fool the qualified guard.
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.execute(
            sql.raw(
              "CREATE TEMP TABLE foundation_improvement_proposal (id uuid, project_id uuid, creation_transaction text) ON COMMIT DROP",
            ),
          );
          await tx.execute(
            sql`insert into pg_temp.foundation_improvement_proposal values (${original.id},${f.projectId},pg_current_xact_id()::text)`,
          );
          await tx.insert(judgeTable).values({
            proposalId: original.id,
            projectId: f.projectId,
            configurationId: f.baseline.id,
            ordinal: 1,
          });
        }),
      );
      const reviewed = await f.improvement.review(
        f.identity,
        "sql-decision",
        await f.reviewInput(original.id),
      );
      const bad = (changes: Partial<FoundationImprovementDecision>) => {
        const { contentDigest: _digest, ...content } = {
          ...reviewed.record,
          id: randomUUID(),
          ...changes,
        };
        return digestRecord(content);
      };
      for (const record of [
        bad({ version: 1, expectedDecisionVersion: 0 }),
        bad({ version: 3, expectedDecisionVersion: 2 }),
        bad({
          expectedProposalDigest: "0".repeat(64),
          version: 2,
          expectedDecisionVersion: 1,
        }),
      ])
        await assert.rejects(
          f.runtime.db.insert(decisionTable).values({
            id: record.id,
            proposalId: original.id,
            projectId: f.projectId,
            environment: "test",
            version: record.version,
            record,
          }),
        );
      await assert.rejects(
        f.runtime.db.execute(
          sql`update foundation_improvement_decision set version=version where proposal_id=${original.id}`,
        ),
      );
      await assert.rejects(
        f.runtime.db.execute(
          sql`delete from foundation_improvement_decision where proposal_id=${original.id}`,
        ),
      );
      assert.equal((await f.counts())!.decisions, 1);
    } finally {
      await f.close();
    }
  },
);

test(
  "parallel real service requests preserve single effects and decision compare-and-swap",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const pair = await Promise.all([
        f.improvement.propose(f.grant.token, "parallel-key", f.input),
        f.parallel.propose(f.grant.token, "parallel-key", f.input),
      ]);
      assert.equal(pair.filter((r) => r.replayed).length, 1);
      assert.deepEqual(pair[0]!.record, pair[1]!.record);
      const proposal = pair[0]!.record;
      const review = await f.reviewInput(proposal.id);
      const results = await Promise.allSettled([
        f.improvement.review(f.identity, "cas-a", review),
        f.parallel.review(f.identity, "cas-b", review),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = results.find((r) => r.status === "rejected");
      assert.ok(
        rejected &&
          rejected.status === "rejected" &&
          denied("VERSION_CONFLICT")(rejected.reason),
      );
      assert.equal((await f.counts())!.proposals, 1);
      assert.equal((await f.counts())!.decisions, 1);
    } finally {
      await f.close();
    }
  },
);

async function acquireLock(f: Fixture, name: string) {
  const client = await f.admin.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ pid: number }>(
      "select pg_backend_pid() as pid",
    );
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      name,
    ]);
    let released = false;
    return {
      pid: result.rows[0]!.pid,
      release: async () => {
        if (released) return;
        released = true;
        try {
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      },
    };
  } catch (error) {
    client.release();
    throw error;
  }
}
async function waitForBlocked(f: Fixture, blocker: number, advisory = true) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await f.admin.db.execute(sql`select pid from pg_stat_activity
      where datname=current_database() and ${blocker}=any(pg_blocking_pids(pid))
        and wait_event_type='Lock' and (${!advisory} or wait_event='advisory')`);
    if (result.rows[0]) return Number(result.rows[0].pid);
    await delay(10);
  }
  throw new Error("Expected actual PostgreSQL lock wait was not observed");
}
async function afterDeadline(f: Fixture, expiresAt: string) {
  await f.admin.db.execute(
    sql`select pg_sleep_until(${expiresAt}::timestamptz + interval '0.02 seconds')`,
  );
}
async function auditGuard(
  f: Fixture,
  operation: "improvement.propose" | "improvement.review",
  lockName?: string,
) {
  const action = lockName
    ? "PERFORM pg_advisory_xact_lock(hashtextextended('" + lockName + "',0));"
    : "RAISE EXCEPTION 'Disposable allowed audit rejection' USING ERRCODE='23514';";
  await f.admin.db.execute(
    sql.raw(`CREATE OR REPLACE FUNCTION public.commandry_improvement_fixture_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $body$
    BEGIN IF NEW.project_id='${f.projectId}'::uuid AND NEW.operation='${operation}' AND NEW.decision='allowed' THEN ${action} END IF; RETURN NEW; END $body$;
    CREATE TRIGGER commandry_improvement_fixture_audit BEFORE INSERT ON public.foundation_audit FOR EACH ROW EXECUTE FUNCTION public.commandry_improvement_fixture_audit();`),
  );
  return async () => {
    await f.admin.db.execute(
      sql.raw(
        "DROP TRIGGER IF EXISTS commandry_improvement_fixture_audit ON public.foundation_audit; DROP FUNCTION IF EXISTS public.commandry_improvement_fixture_audit();",
      ),
    );
  };
}

test(
  "workflow preserves legacy grant denial and rejects foreign scope, principal and source references",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const created = (
        await f.improvement.propose(f.grant.token, "scope-reference", f.input)
      ).record;
      const legacy = await f.owner.createClient(
        {
          name: "Legacy foundation scope only",
          projectId: f.projectId,
          environment: "test",
          operations: ["foundation.read"],
          ttlSeconds: 60,
        },
        "legacy-grant",
      );
      const domainDenial = (error: unknown) => error instanceof FoundationError;
      await assert.rejects(
        f.improvement.list(legacy.token, { projectId: f.projectId, limit: 5 }),
        domainDenial,
      );
      await assert.rejects(
        f.improvement.get(f.grant.token, {
          projectId: f.foreignProjectId,
          id: created.id,
        }),
        domainDenial,
      );
      const production = createFoundationImprovementService(
        createFoundationImprovementAccessRepository(f.otherRuntime.db),
        { environment: "production" },
      );
      await assert.rejects(
        production.get(f.grant.token, {
          projectId: f.projectId,
          id: created.id,
        }),
        domainDenial,
      );
      await assert.rejects(
        f.improvement.getOwner(
          { ...f.identity, principalId: "user:" + randomUUID() },
          { projectId: f.projectId, id: created.id },
        ),
        denied("FORBIDDEN"),
      );
      await assert.rejects(
        f.improvement.getOwner(
          {
            principalId: f.identity.principalId,
            expiresAt: f.identity.expiresAt,
          },
          { projectId: f.projectId, id: created.id },
        ),
        denied("FORBIDDEN"),
      );
      await assert.rejects(
        f.improvement.getOwner(f.identity, {
          projectId: f.foreignProjectId,
          id: created.id,
        }),
        denied("NOT_FOUND"),
      );
      await assert.rejects(
        f.port.withOwner(
          f.ownerRequest("improvement.propose", null),
          async () => null,
        ),
        denied("FORBIDDEN"),
      );
      await assert.rejects(
        f.port.withClient(
          {
            operation: "improvement.review",
            tokenDigest: foundationTokenDigest(f.grant.token),
            projectId: f.projectId,
            environment: "test",
            targetId: created.id,
            correlationId: randomUUID(),
          },
          async () => null,
        ),
        denied("FORBIDDEN"),
      );
      const initial = await f.counts();
      for (const input of [
        { ...f.input, judgeConfigurationIds: [randomUUID()] },
        { ...f.input, definitionId: randomUUID() },
        {
          ...f.input,
          motivations: [
            {
              assessmentId: f.motivation.id,
              assessmentVersion: f.motivation.version + 1,
            },
          ],
        },
        {
          ...f.input,
          motivations: [{ assessmentId: randomUUID(), assessmentVersion: 1 }],
        },
      ])
        await assert.rejects(
          f.improvement.propose(f.grant.token, randomUUID(), input),
          domainDenial,
        );
      assert.deepEqual(await f.counts(), initial);
      await assert.rejects(
        f.port.withOwner(
          f.ownerRequest("improvement.read", null),
          (r: FoundationImprovementRecords) => r.getProposal(created.id),
        ),
        denied("INVALID_REFERENCE"),
      );
      assert.deepEqual(await f.counts(), initial);
    } finally {
      await f.close();
    }
  },
);

test(
  "allowed audit failure rolls back proposals, all normalized relations, decisions and receipts",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    let remove: (() => Promise<void>) | undefined;
    try {
      const before = await f.counts();
      remove = await auditGuard(f, "improvement.propose");
      await assert.rejects(
        f.improvement.propose(f.grant.token, "audit-failed-proposal", f.input),
        denied("INVALID_REFERENCE"),
      );
      assert.deepEqual(await f.counts(), before);
      await remove();
      remove = undefined;
      const proposal = (
        await f.improvement.propose(
          f.grant.token,
          "after-audit-failure",
          f.input,
        )
      ).record;
      const review = await f.reviewInput(proposal.id);
      const existing = await f.counts();
      remove = await auditGuard(f, "improvement.review");
      await assert.rejects(
        f.improvement.review(f.identity, "audit-failed-decision", review),
        denied("INVALID_REFERENCE"),
      );
      assert.deepEqual(await f.counts(), existing);
      assert.equal((await f.detail(proposal.id)).currentDecision, null);
    } finally {
      if (remove) await remove();
      await f.close();
    }
  },
);

test(
  "decision expiry during actual allowed-audit lock wait rolls back the new decision and receipt",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    const name = "T126-audit:" + f.projectId;
    let held: Awaited<ReturnType<typeof acquireLock>> | undefined;
    let remove: (() => Promise<void>) | undefined;
    try {
      const proposal = (
        await f.improvement.propose(f.grant.token, "deadline-proposal", f.input)
      ).record;
      const review = await f.reviewInput(
        proposal.id,
        "accepted",
        new Date(Date.now() + 1800).toISOString(),
      );
      const before = await f.counts();
      held = await acquireLock(f, name);
      remove = await auditGuard(f, "improvement.review", name);
      const pending = f.improvement
        .review(f.identity, "audit-deadline", review)
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
      await waitForBlocked(f, held.pid);
      await afterDeadline(f, review.expiresAt);
      await held.release();
      held = undefined;
      const outcome = await pending;
      assert.ok(outcome.error instanceof FoundationError);
      assert.equal(outcome.value, null);
      assert.deepEqual(await f.counts(), before);
      assert.equal((await f.detail(proposal.id)).currentDecision, null);
      await remove();
      remove = undefined;
      const committedInput = await f.reviewInput(
        proposal.id,
        "rejected",
        new Date(Date.now() + 1200).toISOString(),
      );
      const committed = await f.improvement.review(
        f.identity,
        "committed-history",
        committedInput,
      );
      const counts = await f.counts();
      await afterDeadline(f, committedInput.expiresAt);
      assert.deepEqual(
        (await f.detail(proposal.id)).currentDecision,
        committed.record,
      );
      await assert.rejects(
        f.improvement.review(f.identity, "committed-history", committedInput),
        denied("INVALID_REFERENCE"),
      );
      assert.deepEqual(await f.counts(), counts);
    } finally {
      if (held) await held.release();
      if (remove) await remove();
      await f.close();
    }
  },
);

test(
  "owner session expiry is rechecked after the actual shared evaluation feature lock wait",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    let held: Awaited<ReturnType<typeof acquireLock>> | undefined;
    try {
      const proposal = (
        await f.improvement.propose(
          f.grant.token,
          "session-expiry-proposal",
          f.input,
        )
      ).record;
      const expiry = new Date(Date.now() + 1200).toISOString();
      await f.admin.db.execute(
        sql`update session set expires_at=${expiry}::timestamptz where id=${f.sessionId}`,
      );
      held = await acquireLock(f, "foundation-evaluation:" + f.projectId);
      const pending = f.parallel
        .getOwner(
          { ...f.identity, expiresAt: expiry },
          { projectId: f.projectId, id: proposal.id },
        )
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
      await waitForBlocked(f, held.pid);
      await afterDeadline(f, expiry);
      await held.release();
      held = undefined;
      const result = await pending;
      assert.ok(denied("EXPIRED")(result.error));
      assert.equal(result.value, null);
    } finally {
      if (held) await held.release();
      await f.close();
    }
  },
);

test(
  "owner canonical session revocation queues behind the active transaction and denies later access",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    let held: Awaited<ReturnType<typeof acquireLock>> | undefined;
    try {
      const proposal = (
        await f.improvement.propose(
          f.grant.token,
          "session-revocation-proposal",
          f.input,
        )
      ).record;
      held = await acquireLock(f, "foundation-evaluation:" + f.projectId);
      const pending = f.parallel
        .getOwner(f.identity, { projectId: f.projectId, id: proposal.id })
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
      const workerPid = await waitForBlocked(f, held.pid);
      let revoked = false;
      const revocation = f.admin.db
        .execute(sql`delete from session where id=${f.sessionId}`)
        .then(() => {
          revoked = true;
        });
      await waitForBlocked(f, workerPid, false);
      assert.equal(revoked, false);
      await held.release();
      held = undefined;
      const result = await pending;
      await revocation;
      assert.ok(result.value !== null || denied("FORBIDDEN")(result.error));
      await assert.rejects(
        f.improvement.getOwner(f.identity, {
          projectId: f.projectId,
          id: proposal.id,
        }),
        denied("FORBIDDEN"),
      );
    } finally {
      if (held) await held.release();
      await f.close();
    }
  },
);

test(
  "canonical machine grant expiry is rechecked after an observed feature lock wait",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    let held: Awaited<ReturnType<typeof acquireLock>> | undefined;
    try {
      // Issue a genuinely short-lived canonical grant through the existing
      // service using a fixed historical issuance clock. Its minimum 60 second
      // TTL is retained; no canonical authority row is mutated to fake expiry.
      const issuedAt = Date.now() - 58000;
      const issuanceClock = () => new Date(issuedAt);
      const issuer = createFoundationOwnerService(
        createFoundationAccessRepository(f.runtime.db, { now: issuanceClock }),
        f.identity,
        { environment: "test", now: issuanceClock },
      );
      const expiringGrant = await issuer.createClient(
        {
          name: "Historically issued deterministic expiring grant",
          projectId: f.projectId,
          environment: "test",
          operations: ["improvement.read", "improvement.propose"],
          ttlSeconds: 60,
        },
        "historical-expiring-grant",
      );
      const [canonicalGrant] = await f.admin.db
        .select({ expiresAt: foundationClient.expiresAt })
        .from(foundationClient)
        .where(
          eq(
            foundationClient.tokenDigest,
            foundationTokenDigest(expiringGrant.token),
          ),
        );
      assert.ok(canonicalGrant);
      const expiry = canonicalGrant.expiresAt.toISOString();
      const before = await f.counts();
      held = await acquireLock(f, "foundation-evaluation:" + f.projectId);
      const pending = f.parallel
        .propose(expiringGrant.token, "expired-grant-wait", f.input)
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
      await waitForBlocked(f, held.pid);
      await afterDeadline(f, expiry);
      await held.release();
      held = undefined;
      const result = await pending;
      assert.ok(denied("EXPIRED")(result.error));
      assert.equal(result.value, null);
      assert.deepEqual(await f.counts(), before);
    } finally {
      if (held) await held.release();
      await f.close();
    }
  },
);

test(
  "canonical machine grant revocation waits for the in-flight transaction and denies new requests",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    let held: Awaited<ReturnType<typeof acquireLock>> | undefined;
    try {
      held = await acquireLock(f, "foundation-evaluation:" + f.projectId);
      const pending = f.parallel
        .propose(f.grant.token, "revoked-grant-wait", f.input)
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
      const workerPid = await waitForBlocked(f, held.pid);
      let revoked = false;
      const revocation = f.admin.db
        .update(foundationClient)
        .set({ revokedAt: new Date() })
        .where(eq(foundationClient.projectId, f.projectId))
        .then(() => {
          revoked = true;
        });
      await waitForBlocked(f, workerPid, false);
      assert.equal(revoked, false);
      await held.release();
      held = undefined;
      const outcome = await pending;
      await revocation;
      assert.ok(outcome.value !== null);
      assert.equal((await f.counts())!.proposals, 1);
      assert.equal((await f.counts())!.receipts, 1);
      await assert.rejects(
        f.improvement.propose(f.grant.token, "after-grant-revocation", f.input),
        (error) => error instanceof FoundationError,
      );
    } finally {
      if (held) await held.release();
      await f.close();
    }
  },
);

const constraintFailure = (constraint: string) => (error: unknown) => {
  const wrapped = error as {
    constraint?: string;
    cause?: { constraint?: string };
  };
  return (
    wrapped?.constraint === constraint ||
    wrapped?.cause?.constraint === constraint
  );
};

test(
  "exact version-and-project foreign keys and closed membership guards reject direct SQL writers",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    const foreign = await fixture();
    try {
      const original = (
        await f.improvement.propose(f.grant.token, "specific-guards", f.input)
      ).record;
      const before = await f.counts();
      for (const motivation of [
        {
          assessmentId: f.motivation.id,
          assessmentVersion: f.motivation.version + 1,
        },
        {
          assessmentId: foreign.motivation.id,
          assessmentVersion: foreign.motivation.version,
        },
      ]) {
        const record = proposalContent(original, {
          id: randomUUID(),
          motivations: [motivation],
        });
        await assert.rejects(
          f.runtime.db.transaction((tx) => insertRawProposal(tx, record)),
          constraintFailure(
            "foundation_improvement_motivation_version_scope_fk",
          ),
        );
        assert.deepEqual(await f.counts(), before);
      }
      for (const options of [
        { omit: "conditions" },
        { omit: "judges" },
        { omit: "motivations" },
        { extra: true },
        { reordered: true },
      ] as const) {
        const record = proposalContent(original, { id: randomUUID() });
        await assert.rejects(
          f.runtime.db.transaction((tx) =>
            insertRawProposal(tx, record, options),
          ),
          constraintFailure("foundation_improvement_membership_complete"),
        );
        assert.deepEqual(await f.counts(), before);
      }
      const late = [
        () =>
          f.runtime.db.insert(conditionTable).values({
            proposalId: original.id,
            projectId: f.projectId,
            conditionOrdinal: 0,
            condition: "baseline",
            role: "baseline",
            configurationId: f.baseline.id,
            ordinal: 3,
          }),
        () =>
          f.runtime.db.insert(judgeTable).values({
            proposalId: original.id,
            projectId: f.projectId,
            configurationId: f.baseline.id,
            ordinal: 1,
          }),
        () =>
          f.runtime.db.insert(motivationTable).values({
            proposalId: original.id,
            projectId: f.projectId,
            assessmentId: f.motivation.id,
            assessmentVersion: f.motivation.version,
            ordinal: 1,
          }),
      ];
      for (const insert of late)
        await assert.rejects(
          insert(),
          constraintFailure("foundation_improvement_membership_closed"),
        );
      for (const table of [
        proposalTable,
        conditionTable,
        judgeTable,
        motivationTable,
      ]) {
        await assert.rejects(
          f.runtime.db.execute(
            sql`update ${table} set project_id=project_id where project_id=${f.projectId}`,
          ),
          constraintFailure("foundation_improvement_immutable"),
        );
        await assert.rejects(
          f.runtime.db.execute(
            sql`delete from ${table} where project_id=${f.projectId}`,
          ),
          constraintFailure("foundation_improvement_immutable"),
        );
      }
      const accepted = (
        await f.improvement.review(
          f.identity,
          "guard-decision",
          await f.reviewInput(original.id),
        )
      ).record;
      const { contentDigest: _digest, ...content } = accepted;
      const next = digestRecord({
        ...content,
        id: randomUUID(),
        version: 2,
        expectedDecisionVersion: 1,
      });
      await assert.rejects(
        f.runtime.db.insert(decisionTable).values({
          id: next.id,
          proposalId: original.id,
          projectId: f.projectId,
          environment: "test",
          version: 2,
          record: { ...next, contentDigest: "0".repeat(64) },
        }),
        constraintFailure("foundation_improvement_decision_record_valid"),
      );
      assert.equal((await f.counts())!.decisions, 1);
    } finally {
      await foreign.close();
      await f.close();
    }
  },
);

test(
  "different inputs racing for one new idempotency key commit exactly one proposal",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const results = await Promise.allSettled([
        f.improvement.propose(f.grant.token, "different-input-race", f.input),
        f.parallel.propose(f.grant.token, "different-input-race", {
          ...f.input,
          hypothesis: "Another deterministic fixture hypothesis",
        }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejection = results.find((r) => r.status === "rejected");
      assert.ok(
        rejection &&
          rejection.status === "rejected" &&
          denied("IDEMPOTENCY_CONFLICT")(rejection.reason),
      );
      const counts = await f.counts();
      assert.equal(counts!.proposals, 1);
      assert.equal(counts!.conditions, 6);
      assert.equal(counts!.judges, 1);
      assert.equal(counts!.motivations, 1);
      assert.equal(counts!.receipts, 1);
      assert.equal(counts!.allowed, 1);
    } finally {
      await f.close();
    }
  },
);

const javascriptTrimWhitespace = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680, 0x2000,
  0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009,
  0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
].map((point) => ({
  label: "U+" + point.toString(16).toUpperCase().padStart(4, "0"),
  value: String.fromCodePoint(point),
}));

test(
  "SQL proposal environment and nonblank fields match exact DTO trim semantics",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const original = (
        await f.improvement.propose(
          f.grant.token,
          "dto-integrity-proposal",
          f.input,
        )
      ).record;
      const before = await f.counts();
      const failures: string[] = [];
      const cases: { label: string; record: FoundationImprovementProposal }[] =
        [
          {
            label: "unsupported environment",
            record: proposalContent(original, {
              id: randomUUID(),
              environment:
                "unsupported" as FoundationImprovementProposal["environment"],
            }),
          },
        ];
      for (const field of ["rationale", "hypothesis"] as const)
        for (const whitespace of javascriptTrimWhitespace) {
          assert.equal(whitespace.value.trim(), "");
          cases.push({
            label: field + " " + whitespace.label,
            record: proposalContent(original, {
              id: randomUUID(),
              [field]: whitespace.value,
            }),
          });
        }
      for (const { label, record } of cases) {
        checkedDigest(record);
        assert.equal(
          foundationImprovementProposalSchema.safeParse(record).success,
          false,
          label,
        );
        const accepted = new Error(
          "Invalid DTO record passed immediate and deferred SQL guards",
        );
        try {
          await f.runtime.db.transaction(async (tx) => {
            await insertRawProposal(tx, record);
            await tx.execute(sql.raw("SET CONSTRAINTS ALL IMMEDIATE"));
            throw accepted;
          });
        } catch (error) {
          if (error === accepted) failures.push(label + ": accepted");
          else if (
            !constraintFailure("foundation_improvement_proposal_record_valid")(
              error,
            )
          )
            failures.push(label + ": wrong rejection guard");
        }
        assert.deepEqual(
          await f.counts(),
          before,
          label + " must leave no rows",
        );
      }
      assert.deepEqual(
        failures,
        [],
        "Strict DTO-invalid proposals must fail the actual record CHECK",
      );
      // These characters are not JavaScript trim whitespace. Preserve them and
      // validate every supported environment against both DTO and actual SQL.
      const nonTrimText = String.fromCodePoint(0x0085, 0x180e, 0x200b);
      assert.notEqual(nonTrimText.trim(), "");
      for (const environment of [
        "local",
        "test",
        "preview",
        "production",
      ] as const) {
        const record = proposalContent(original, {
          id: randomUUID(),
          environment,
          rationale: nonTrimText,
          hypothesis: nonTrimText,
        });
        assert.equal(
          foundationImprovementProposalSchema.safeParse(record).success,
          true,
        );
        await f.runtime.db.transaction((tx) => insertRawProposal(tx, record));
      }
    } finally {
      await f.close();
    }
  },
);

test(
  "SQL decision reason rejects every JavaScript trim whitespace character",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const proposal = (
        await f.improvement.propose(
          f.grant.token,
          "dto-decision-proposal",
          f.input,
        )
      ).record;
      const review = await f.reviewInput(proposal.id, "rejected");
      const before = await f.counts();
      const failures: string[] = [];
      for (const whitespace of javascriptTrimWhitespace) {
        const record: FoundationImprovementDecision = digestRecord({
          ...review,
          schemaVersion: 1,
          id: randomUUID(),
          version: 1,
          reason: whitespace.value,
          recordedBy: f.identity.principalId,
          recordedAt: new Date().toISOString(),
        });
        checkedDigest(record);
        assert.equal(
          foundationImprovementDecisionSchema.safeParse(record).success,
          false,
          whitespace.label,
        );
        const accepted = new Error(
          "Invalid DTO decision passed immediate and deferred SQL guards",
        );
        try {
          await f.runtime.db.transaction(async (tx) => {
            await tx.insert(decisionTable).values({
              id: record.id,
              proposalId: proposal.id,
              projectId: f.projectId,
              environment: "test",
              version: record.version,
              record,
            });
            await tx.execute(sql.raw("SET CONSTRAINTS ALL IMMEDIATE"));
            throw accepted;
          });
        } catch (error) {
          if (error === accepted)
            failures.push(whitespace.label + ": accepted");
          else if (
            !constraintFailure("foundation_improvement_decision_record_valid")(
              error,
            )
          )
            failures.push(whitespace.label + ": wrong rejection guard");
        }
        assert.deepEqual(
          await f.counts(),
          before,
          whitespace.label + " must leave no rows",
        );
      }
      assert.deepEqual(
        failures,
        [],
        "Strict DTO-invalid decisions must fail the actual record CHECK",
      );
      const record: FoundationImprovementDecision = digestRecord({
        ...review,
        schemaVersion: 1,
        id: randomUUID(),
        version: 1,
        reason: String.fromCodePoint(0x0085, 0x180e, 0x200b),
        recordedBy: f.identity.principalId,
        recordedAt: new Date().toISOString(),
      });
      assert.equal(
        foundationImprovementDecisionSchema.safeParse(record).success,
        true,
      );
      await f.runtime.db.insert(decisionTable).values({
        id: record.id,
        proposalId: proposal.id,
        projectId: f.projectId,
        environment: "test",
        version: record.version,
        record,
      });
      assert.equal((await f.counts())!.decisions, 1);
    } finally {
      await f.close();
    }
  },
);
