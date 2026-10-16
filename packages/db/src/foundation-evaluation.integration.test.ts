import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import {
  createFoundationMachineService,
  createFoundationOwnerService,
  createFoundationEvaluationService,
  createFoundationEvaluationOwnerService,
} from "@commandry/application";
import { FoundationError } from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationEvaluationAccessRepository } from "./foundation-evaluation-access-repository";
import { foundationByteDigest } from "./foundation-record-repository";
import { project } from "./schema";
import {
  foundationEvaluationDefinition,
  foundationEvaluationDefinitionConfiguration,
} from "./foundation-evaluation-schema";
import type {
  FoundationAssessment,
  FoundationEvaluationTrial,
} from "@commandry/contracts";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Use the disposable PostgreSQL integration harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;
const isDenied = (codes: string[]) => (error: unknown) =>
  error instanceof FoundationError && codes.includes(error.code);
async function fixture() {
  const admin = createDatabase({ connectionString: adminUrl!, max: 3 });
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 5,
  });
  const projectId = crypto.randomUUID();
  const foreignProject = crypto.randomUUID();
  await admin.db.insert(project).values([
    { id: projectId, name: "Evaluation persistence" },
    { id: foreignProject, name: "Outside evaluation scope" },
  ]);
  const identity = {
    principalId: "user:evaluation-integration-owner",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const owner = createFoundationOwnerService(
    createFoundationAccessRepository(runtime.db),
    identity,
    { environment: "test" },
  );
  const grant = await owner.createClient(
    {
      name: "Evaluation integration",
      projectId,
      environment: "test",
      operations: [
        "foundation.read",
        "configuration.record",
        "evaluation.record",
      ],
      ttlSeconds: 3600,
    },
    "evaluation-client",
  );
  const core = createFoundationMachineService(
    createFoundationAccessRepository(runtime.db),
    { environment: "test" },
  );
  const port = createFoundationEvaluationAccessRepository(runtime.db);
  const evaluation = createFoundationEvaluationService(port, {
    environment: "test",
  });
  const review = createFoundationEvaluationOwnerService(port, identity, {
    environment: "test",
  });
  const subject = (
    await core.recordConfiguration(
      grant.token,
      {
        projectId,
        kind: "prompt",
        content: "Synthetic scoped fixture prompt",
        parentIds: [],
        sourceCommit: null,
      },
      "subject-config",
    )
  ).record;
  const judge = (
    await core.recordConfiguration(
      grant.token,
      {
        projectId,
        kind: "model",
        content: "Deterministic fixture checks, no model execution",
        parentIds: [],
        sourceCommit: null,
      },
      "judge-config",
    )
  ).record;
  const definition = {
    schemaVersion: 1 as const,
    id: crypto.randomUUID(),
    projectId,
    version: 1,
    name: "Four declared cells",
    configurationIds: [subject.id],
    cases: [
      {
        id: "fixture",
        fixtureDigest: foundationByteDigest("exact fixture"),
        rubricDigest: foundationByteDigest("exact rubric"),
        hardGates: ["scope"],
      },
    ],
    conditions: ["baseline", "candidate"],
    repetitions: 2,
    disclosure: "local_only" as const,
  };
  const mappings = definition.conditions.map((condition) => ({
    condition,
    configurationIds: [subject.id],
  }));
  const trial = (
    condition = "baseline",
    repetition = 1,
    outcome: FoundationEvaluationTrial["outcome"] = "completed",
  ): FoundationEvaluationTrial => ({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    attemptId: crypto.randomUUID(),
    definitionId: definition.id,
    projectId,
    caseId: "fixture",
    condition,
    repetition,
    configurationIds: [subject.id],
    model: "synthetic-fixture-model",
    runtime: "fixture-observation-only",
    inputDigest: definition.cases[0]!.fixtureDigest,
    artifactDigests:
      outcome === "completed"
        ? [foundationByteDigest(`${condition}:${repetition}:artifact`)]
        : [],
    outcome,
    usage: { inputTokens: null, outputTokens: null },
    recordedAt: "2026-10-16T01:02:03.123456789+01:00",
  });
  const assessment = (
    row: FoundationEvaluationTrial,
  ): FoundationAssessment => ({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    trialId: row.id,
    projectId,
    version: 1,
    trialArtifactDigest: row.artifactDigests[0]!,
    rubricDigest: definition.cases[0]!.rubricDigest,
    judgeConfigurationId: judge.id,
    checks: [{ id: "scope", result: "pass", hardGate: true }],
    uncertainty: "Synthetic checks are not model performance",
    reviewStatus: "unreviewed",
    recordedAt: "2026-10-16T01:02:04.987654321+01:00",
  });
  return {
    admin,
    runtime,
    owner,
    grant,
    evaluation,
    review,
    projectId,
    foreignProject,
    definition,
    subject,
    judge,
    trial,
    assessment,
    report: () =>
      evaluation.report(grant.token, projectId, definition.id, mappings, [
        judge.id,
      ]),
    close: async () => {
      await runtime.close();
      await admin.close();
    },
  };
}

test(
  "evaluation persistence preserves exact observations and separate owner review with complete four-cell denominators",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const first = await f.evaluation.recordDefinition(
        f.grant.token,
        f.definition,
        "definition",
      );
      const retried = await f.evaluation.recordDefinition(
        f.grant.token,
        f.definition,
        "definition",
      );
      assert.equal(retried.replayed, true);
      assert.deepEqual(retried.record, first.record);
      assert.equal(retried.correlationId, first.correlationId);
      const empty = await f.report();
      assert.equal(empty.eligibleForReview, false);
      assert.ok(empty.blockers.includes("no_observations"));
      const pending: FoundationAssessment[] = [];
      for (const condition of f.definition.conditions)
        for (const repetition of [1, 2]) {
          const trial = f.trial(condition, repetition);
          const stored = await f.evaluation.recordTrial(
            f.grant.token,
            trial,
            trial.id,
          );
          assert.deepEqual(stored.record, trial);
          assert.deepEqual(
            await f.evaluation.getTrial(f.grant.token, f.projectId, trial.id),
            trial,
          );
          const assessment = f.assessment(trial);
          await f.evaluation.recordAssessment(
            f.grant.token,
            assessment,
            assessment.id,
          );
          pending.push(assessment);
        }
      const unreviewed = await f.report();
      assert.equal(unreviewed.eligibleForReview, false);
      assert.equal(unreviewed.comparisons[0]!.counts.expectedCells, 4);
      assert.equal(unreviewed.comparisons[0]!.counts.passedCells, 0);
      for (const assessment of pending)
        await f.review.reviewAssessment(
          {
            ...assessment,
            id: crypto.randomUUID(),
            version: 2,
            reviewStatus: "reviewed",
            recordedAt: new Date().toISOString(),
          },
          `review:${assessment.id}`,
        );
      const reviewed = await f.report();
      assert.equal(reviewed.eligibleForReview, true);
      assert.equal(reviewed.comparisons[0]!.counts.passedCells, 4);
      assert.equal(reviewed.comparisons[0]!.counts.attemptCount, 4);
      assert.deepEqual(
        reviewed.comparisons[0]!.conditions.map((row) => row.successFraction),
        [
          { numerator: 2, denominator: 2 },
          { numerator: 2, denominator: 2 },
        ],
      );
      const audit = await f.runtime.db.execute(
        sql`select principal_id, client_id, decision from foundation_audit where project_id=${f.projectId} and operation='evaluation.record'`,
      );
      assert.ok(
        audit.rows.some(
          (row) =>
            row.client_id === null &&
            row.principal_id === "user:evaluation-integration-owner" &&
            row.decision === "allowed",
        ),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "evaluation retains unsupported and failed attempts, missing cells and machine review denials without counting them as passes",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      await f.evaluation.recordDefinition(
        f.grant.token,
        f.definition,
        "definition",
      );
      for (const [index, outcome] of (
        ["failed", "unsupported", "infrastructure_failed"] as const
      ).entries()) {
        const row = f.trial(
          index === 2 ? "candidate" : "baseline",
          index === 1 ? 2 : 1,
          outcome,
        );
        await f.evaluation.recordTrial(f.grant.token, row, row.id);
      }
      const report = await f.report();
      assert.equal(report.eligibleForReview, false);
      const counts = report.comparisons[0]!.counts;
      assert.equal(counts.expectedCells, 4);
      assert.equal(counts.attemptCount, 3);
      assert.equal(counts.missingCells, 1);
      assert.equal(counts.passedCells, 0);
      const good = f.trial("candidate", 2);
      await f.evaluation.recordTrial(f.grant.token, good, good.id);
      await assert.rejects(
        async () =>
          f.evaluation.recordAssessment(
            f.grant.token,
            { ...f.assessment(good), reviewStatus: "reviewed" },
            "machine-review",
          ),
        isDenied(["FORBIDDEN"]),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "evaluation serializes identical retries and next-version races across real connections",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      await f.evaluation.recordDefinition(
        f.grant.token,
        f.definition,
        "definition",
      );
      const row = f.trial();
      const retries = await Promise.all([
        f.evaluation.recordTrial(f.grant.token, row, "same-trial"),
        f.evaluation.recordTrial(f.grant.token, row, "same-trial"),
      ]);
      assert.deepEqual(retries.map((item) => item.replayed).sort(), [
        false,
        true,
      ]);
      assert.equal(retries[0]!.correlationId, retries[1]!.correlationId);
      await assert.rejects(
        f.evaluation.recordTrial(
          f.grant.token,
          { ...row, id: crypto.randomUUID() },
          "duplicate-attempt",
        ),
        isDenied(["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT"]),
      );
      const assessment = f.assessment(row);
      const races = await Promise.allSettled([
        f.evaluation.recordAssessment(
          f.grant.token,
          assessment,
          "assessment-a",
        ),
        f.evaluation.recordAssessment(
          f.grant.token,
          { ...assessment, id: crypto.randomUUID() },
          "assessment-b",
        ),
      ]);
      assert.equal(
        races.filter((item) => item.status === "fulfilled").length,
        1,
      );
      assert.equal(
        races.filter((item) => item.status === "rejected").length,
        1,
      );
      const population = await f.runtime.db.execute(
        sql`select count(*)::int as count from foundation_evaluation_assessment where trial_id=${row.id}`,
      );
      assert.equal(population.rows[0]!.count, 1);
    } finally {
      await f.close();
    }
  },
);

test(
  "evaluation reference scope, audit rollback, immutable history and current revocation fail safely",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      await f.evaluation.recordDefinition(
        f.grant.token,
        f.definition,
        "definition",
      );
      await assert.rejects(
        f.evaluation.getDefinition(
          f.grant.token,
          f.foreignProject,
          f.definition.id,
        ),
        isDenied(["FORBIDDEN"]),
      );
      await assert.rejects(
        f.evaluation.recordTrial(
          f.grant.token,
          { ...f.trial(), inputDigest: foundationByteDigest("wrong fixture") },
          "substituted-fixture",
        ),
        isDenied(["INVALID_REFERENCE"]),
      );
      const row = f.trial();
      await f.admin.db.execute(
        sql.raw(
          `create function foundation_eval_test_audit_failure() returns trigger language plpgsql as $$ begin if NEW.target_id = '${row.id}'::uuid and NEW.operation = 'evaluation.record' and NEW.decision = 'allowed' then raise exception 'synthetic late audit failure'; end if; return NEW; end $$`,
        ),
      );
      await f.admin.db.execute(
        sql`create trigger foundation_eval_test_audit_failure before insert on foundation_audit for each row execute function foundation_eval_test_audit_failure()`,
      );
      try {
        await assert.rejects(
          f.evaluation.recordTrial(f.grant.token, row, "audit-fails"),
        );
        const count = await f.runtime.db.execute(
          sql`select count(*)::int as count from foundation_evaluation_trial where id=${row.id}`,
        );
        assert.equal(count.rows[0]!.count, 0);
      } finally {
        await f.admin.db.execute(
          sql`drop trigger foundation_eval_test_audit_failure on foundation_audit`,
        );
        await f.admin.db.execute(
          sql`drop function foundation_eval_test_audit_failure()`,
        );
      }
      await f.evaluation.recordTrial(f.grant.token, row, "audit-fails");
      await assert.rejects(
        f.runtime.db.execute(
          sql`update foundation_evaluation_trial set record=record || '{"model":"changed"}'::jsonb where id=${row.id}`,
        ),
      );
      await assert.rejects(
        f.runtime.db.execute(
          sql`delete from foundation_evaluation_trial where id=${row.id}`,
        ),
      );
      await f.owner.revokeClient({ clientId: f.grant.client.id });
      await assert.rejects(
        f.evaluation.getTrial(f.grant.token, f.projectId, row.id),
        isDenied(["REVOKED"]),
      );
      await assert.rejects(
        f.evaluation.recordTrial(f.grant.token, row, "audit-fails"),
        isDenied(["REVOKED"]),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "evaluation configuration membership is closed, complete, ordered and nonforgeable across savepoints",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      await f.evaluation.recordDefinition(
        f.grant.token,
        f.definition,
        "definition",
      );
      await assert.rejects(
        f.runtime.db
          .insert(foundationEvaluationDefinitionConfiguration)
          .values({
            definitionId: f.definition.id,
            projectId: f.projectId,
            configurationId: f.judge.id,
            ordinal: 1,
          }),
      );
      const incompleteId = crypto.randomUUID();
      await assert.rejects(
        f.runtime.db.insert(foundationEvaluationDefinition).values({
          id: incompleteId,
          projectId: f.projectId,
          version: 1,
          record: { ...f.definition, id: incompleteId },
          creationTransaction: "caller-forged",
        }),
      );
      const count = await f.runtime.db.execute(
        sql`select count(*)::int as count from foundation_evaluation_definition where id=${incompleteId}`,
      );
      assert.equal(count.rows[0]!.count, 0);
      const orderedId = crypto.randomUUID();
      await f.runtime.db.transaction(async (tx) => {
        await tx.insert(foundationEvaluationDefinition).values({
          id: orderedId,
          projectId: f.projectId,
          version: 1,
          record: {
            ...f.definition,
            id: orderedId,
            configurationIds: [f.subject.id, f.judge.id],
          },
          creationTransaction: "caller-forged",
        });
        await tx.transaction(async (savepoint) => {
          await savepoint
            .insert(foundationEvaluationDefinitionConfiguration)
            .values([
              {
                definitionId: orderedId,
                projectId: f.projectId,
                configurationId: f.subject.id,
                ordinal: 0,
              },
              {
                definitionId: orderedId,
                projectId: f.projectId,
                configurationId: f.judge.id,
                ordinal: 1,
              },
            ]);
        });
        const [row] = await tx
          .select()
          .from(foundationEvaluationDefinition)
          .where(sql`id=${orderedId}`);
        assert.notEqual(row!.creationTransaction, "caller-forged");
      });
      assert.deepEqual(
        (
          await f.evaluation.getDefinition(
            f.grant.token,
            f.projectId,
            orderedId,
          )
        ).configurationIds,
        [f.subject.id, f.judge.id],
      );
      const reversedId = crypto.randomUUID();
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.insert(foundationEvaluationDefinition).values({
            id: reversedId,
            projectId: f.projectId,
            version: 1,
            record: {
              ...f.definition,
              id: reversedId,
              configurationIds: [f.subject.id, f.judge.id],
            },
          });
          await tx.insert(foundationEvaluationDefinitionConfiguration).values([
            {
              definitionId: reversedId,
              projectId: f.projectId,
              configurationId: f.judge.id,
              ordinal: 0,
            },
            {
              definitionId: reversedId,
              projectId: f.projectId,
              configurationId: f.subject.id,
              ordinal: 1,
            },
          ]);
        }),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "runtime temporary tables cannot shadow immutable public evaluation membership guards",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    const shadow = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 1,
    });
    const checkViolation = (error: unknown): boolean =>
      !!error &&
      typeof error === "object" &&
      (("code" in error && error.code === "23514") ||
        ("cause" in error && checkViolation(error.cause)));
    try {
      await f.evaluation.recordDefinition(
        f.grant.token,
        f.definition,
        "definition",
      );
      await assert.rejects(
        shadow.db.transaction(async (tx) => {
          await tx.execute(
            sql`create temporary table foundation_evaluation_definition (id uuid, project_id uuid, record jsonb, creation_transaction text)`,
          );
          await tx.execute(
            sql`create temporary table foundation_evaluation_definition_configuration (definition_id uuid, project_id uuid, configuration_id uuid, ordinal integer)`,
          );
          await tx.execute(
            sql`insert into pg_temp.foundation_evaluation_definition values (${f.definition.id}, ${f.projectId}, ${JSON.stringify({ configurationIds: [f.subject.id, f.judge.id] })}::jsonb, pg_current_xact_id()::text)`,
          );
          await tx.execute(
            sql`insert into pg_temp.foundation_evaluation_definition_configuration values (${f.definition.id}, ${f.projectId}, ${f.subject.id}, 0), (${f.definition.id}, ${f.projectId}, ${f.judge.id}, 1)`,
          );
          await tx.execute(
            sql`insert into public.foundation_evaluation_definition_configuration (definition_id, project_id, configuration_id, ordinal) values (${f.definition.id}, ${f.projectId}, ${f.judge.id}, 1)`,
          );
          await tx.execute(sql`set constraints all immediate`);
          // Roll back even on the vulnerable implementation; the marker proves no guard denied it.
          throw new Error("SHADOW_BYPASS_SUCCEEDED");
        }),
        checkViolation,
      );
    } finally {
      await shadow.close();
      await f.close();
    }
  },
);

test(
  "runtime temporary parents cannot reopen committed core configuration provenance",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    const shadow = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 1,
    });
    const checkViolation = (error: unknown): boolean =>
      !!error &&
      typeof error === "object" &&
      (("code" in error && error.code === "23514") ||
        ("cause" in error && checkViolation(error.cause)));
    try {
      await assert.rejects(
        shadow.db.transaction(async (tx) => {
          await tx.execute(
            sql`create temporary table foundation_configuration (id uuid, project_id uuid, creation_transaction text)`,
          );
          await tx.execute(
            sql`insert into pg_temp.foundation_configuration values (${f.subject.id}, ${f.projectId}, pg_current_xact_id()::text)`,
          );
          await tx.execute(
            sql`insert into public.foundation_configuration_parent (configuration_id, project_id, parent_id, ordinal) values (${f.subject.id}, ${f.projectId}, ${f.judge.id}, 0)`,
          );
          throw new Error("CORE_SHADOW_BYPASS_SUCCEEDED");
        }),
        checkViolation,
      );
    } finally {
      await shadow.close();
      await f.close();
    }
  },
);
