import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import {
  createDatabase,
  migrateDatabase,
  schema,
  createFoundationAccessRepository,
  createFoundationTaskProposalAccessRepository,
  createFoundationEvaluationAccessRepository,
  createFoundationImprovementAccessRepository,
  createFoundationFindingProposalAccessRepository,
  createFoundationOnboardingAccessRepository,
} from "../packages/db/src/index.ts";
import {
  createFoundationMachineService,
  createFoundationOwnerService,
  createFoundationTaskProposalService,
  createFoundationEvaluationService,
  createFoundationEvaluationOwnerService,
  createFoundationImprovementService,
  createFoundationFindingProposalService,
  createFoundationOnboardingService,
} from "../packages/application/src/index.ts";
import { FoundationError } from "../packages/domain/src/index.ts";
import { fileCaptureNoteInTransaction } from "../packages/db/src/capture-note-filing.ts";

// All data, passwords and roles in this audit belong to the disposable cluster.
// No application deployment, owner credential, inference or external fetch occurs.
const root = resolve(import.meta.dirname, "..");
const migrationsDir = join(root, "packages/db/migrations");
const journal = JSON.parse(
  await readFile(join(migrationsDir, "meta/_journal.json"), "utf8"),
);
assert.ok(
  journal.entries.some((entry) => entry.idx === 67),
  "Register the real workflow migrations before this audit",
);
const directory = await mkdtemp(join(tmpdir(), "commandry-workflow-upgrade-"));
const listener = createServer();
await new Promise((done, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", done);
});
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const password = randomBytes(24).toString("hex"),
  runtimePassword = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({
  databaseDir: join(directory, "data"),
  port,
  user: "postgres",
  password,
  authMethod: "scram-sha-256",
  persistent: false,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const url = (database, role = "postgres", secret = password) =>
  `postgresql://${role}:${secret}@127.0.0.1:${port}/${database}`;
const hash = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const denied = (code) => (error) =>
  error instanceof FoundationError && error.code === code;
const tables = [
  "resource",
  "project",
  "project_resource_link",
  "capture",
  "capture_triage_suggestion",
  "capture_triage_decision",
  "work_item",
  "knowledge_item",
  "foundation_client",
  "foundation_evidence",
  "foundation_configuration",
  "foundation_configuration_parent",
  "foundation_evaluation_definition",
  "foundation_evaluation_trial",
  "foundation_evaluation_assessment",
  "foundation_evaluation_definition_configuration",
  "foundation_evaluation_trial_configuration",
  "foundation_idempotency",
  "foundation_audit",
  "user",
  "session",
];
async function snapshot(database) {
  const result = {};
  for (const table of tables)
    result[table] = (
      await database.pool.query(
        `select to_jsonb(t) as record from public."${table}" t order by to_jsonb(t)::text`,
      )
    ).rows.map((row) => row.record);
  return result;
}
async function migrationCount(database) {
  assert.equal(
    Number(
      (
        await database.pool.query(
          "select count(*) as n from drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
    ),
    journal.entries.length,
  );
}
let started = false,
  admin,
  runtime,
  clean;
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase("commandry_workflow_clean");
  await migrateDatabase({
    connectionString: url("commandry_workflow_clean"),
    migrationsDir,
  });
  await migrateDatabase({
    connectionString: url("commandry_workflow_clean"),
    migrationsDir,
  });
  clean = createDatabase({
    connectionString: url("commandry_workflow_clean"),
    max: 1,
  });
  assert.match(
    (await clean.pool.query("show server_version")).rows[0].server_version,
    /^18\./,
  );
  await migrationCount(clean);
  for (const table of [
    "foundation_improvement_proposal",
    "foundation_finding_proposal",
    "foundation_onboarding_proposal",
    "resource_identity_claim",
  ])
    assert.equal(
      (
        await clean.pool.query("select to_regclass($1) as name", [
          "public." + table,
        ])
      ).rows[0].name,
      table,
    );
  console.log(
    JSON.stringify({
      scenario: "clean_latest_journal_twice",
      result: "PASS",
      migrations: journal.entries.length,
    }),
  );
  await postgres.createDatabase("commandry_workflow_populated");
  const oldDir = join(directory, "migrations-0063");
  await cp(migrationsDir, oldDir, { recursive: true });
  await writeFile(
    join(oldDir, "meta/_journal.json"),
    JSON.stringify({
      ...journal,
      entries: journal.entries.filter((entry) => entry.idx <= 63),
    }),
  );
  await migrateDatabase({
    connectionString: url("commandry_workflow_populated"),
    migrationsDir: oldDir,
  });
  admin = createDatabase({
    connectionString: url("commandry_workflow_populated"),
    max: 2,
  });
  const role = "commandry_workflow_upgrade_runtime";
  await admin.pool.query(
    `create role ${role} login password '${runtimePassword}'`,
  );
  await admin.pool.query(
    `grant connect on database commandry_workflow_populated to ${role}`,
  );
  await admin.pool.query(`grant usage on schema public to ${role}`);
  await admin.pool.query(
    `grant select,insert,update,delete on all tables in schema public to ${role}`,
  );
  await admin.pool.query(
    `grant usage,select on all sequences in schema public to ${role}`,
  );
  runtime = createDatabase({
    connectionString: url(
      "commandry_workflow_populated",
      role,
      runtimePassword,
    ),
    max: 2,
  });
  const projectId = randomUUID(),
    userId = randomUUID(),
    sessionId = randomUUID(),
    hostId = randomUUID(),
    providerId = randomUUID();
  await admin.db
    .insert(schema.project)
    .values({ id: projectId, name: "Populated migration audit" });
  await admin.db.insert(schema.user).values({
    id: userId,
    name: "Disposable owner",
    email: userId + "@example.test",
  });
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  await admin.db.insert(schema.session).values({
    id: sessionId,
    userId,
    token: randomUUID(),
    expiresAt: new Date(expiresAt),
  });
  await admin.db
    .insert(schema.resource)
    .values({ id: providerId, kind: "provider", name: "Disposable provider" });
  await admin.db.insert(schema.resource).values({
    id: hostId,
    kind: "host",
    name: "Preserved host",
    parentResourceId: providerId,
  });
  await admin.db.insert(schema.projectResourceLink).values({
    id: randomUUID(),
    projectId,
    resourceId: hostId,
    type: "supports",
    sourceKind: "resource",
    targetKind: "project",
  });
  const identity = { principalId: "user:" + userId, sessionId, expiresAt };
  const base = createFoundationAccessRepository(runtime.db),
    options = { environment: "test" };
  const owner = createFoundationOwnerService(base, identity, options),
    machine = createFoundationMachineService(base, options);
  const operations = [
    "foundation.read",
    "evidence.record",
    "configuration.record",
    "evaluation.record",
    "work.propose",
  ];
  const legacy = await owner.createClient(
    {
      projectId,
      name: "Pre-0064 exact grants",
      environment: "test",
      operations,
      ttlSeconds: 3600,
    },
    randomUUID(),
  );
  const config = async (name, kind = "prompt", parentIds = []) =>
    (
      await machine.recordConfiguration(
        legacy.token,
        {
          projectId,
          kind,
          content: "Migration fixture " + name,
          parentIds,
          sourceCommit: null,
        },
        randomUUID(),
      )
    ).record;
  const baseline = await config("baseline"),
    candidate = await config("candidate", "prompt", [baseline.id]),
    judge = await config("judge", "model");
  const evaluationPort = createFoundationEvaluationAccessRepository(runtime.db);
  const evaluation = createFoundationEvaluationService(evaluationPort, options),
    evaluationOwner = createFoundationEvaluationOwnerService(
      evaluationPort,
      identity,
      options,
    );
  const definition = {
    schemaVersion: 1,
    id: randomUUID(),
    projectId,
    version: 1,
    name: "Historical migration-only fixture",
    configurationIds: [baseline.id],
    cases: [
      {
        id: "fixture",
        fixtureDigest: hash("fixture"),
        rubricDigest: hash("rubric"),
        hardGates: ["scope"],
      },
    ],
    conditions: ["baseline"],
    repetitions: 1,
    disclosure: "local_only",
  };
  await evaluation.recordDefinition(legacy.token, definition, randomUUID());
  const trial = {
    schemaVersion: 1,
    id: randomUUID(),
    attemptId: randomUUID(),
    projectId,
    definitionId: definition.id,
    caseId: "fixture",
    condition: "baseline",
    repetition: 1,
    configurationIds: [baseline.id],
    model: "deterministic-migration-fixture",
    runtime: "no-model-execution",
    inputDigest: hash("fixture"),
    artifactDigests: [hash("artifact")],
    outcome: "completed",
    usage: { inputTokens: null, outputTokens: null },
    recordedAt: new Date().toISOString(),
  };
  await evaluation.recordTrial(legacy.token, trial, randomUUID());
  const assessment = {
    schemaVersion: 1,
    id: randomUUID(),
    trialId: trial.id,
    projectId,
    version: 1,
    trialArtifactDigest: trial.artifactDigests[0],
    rubricDigest: hash("rubric"),
    judgeConfigurationId: judge.id,
    checks: [{ id: "scope", result: "fail", hardGate: true }],
    uncertainty: "Migration fixture, not model performance",
    reviewStatus: "unreviewed",
    recordedAt: new Date().toISOString(),
  };
  await evaluation.recordAssessment(legacy.token, assessment, randomUUID());
  await evaluationOwner.reviewAssessment(
    {
      ...assessment,
      id: randomUUID(),
      version: 2,
      reviewStatus: "reviewed",
      recordedAt: new Date().toISOString(),
    },
    randomUUID(),
  );
  const captureId = randomUUID(),
    knowledgeId = randomUUID(),
    source = "  Original canonical migration source\r\n";
  await admin.db.insert(schema.capture).values({
    id: captureId,
    inputType: "text",
    originalContent: source,
    projectId,
  });
  await admin.db.transaction((tx) =>
    fileCaptureNoteInTransaction(tx, {
      captureId,
      recordId: knowledgeId,
      projectId,
      title: "Canonical source",
      content: source,
      at: new Date(),
    }),
  );
  const evidence = (
    await machine.recordEvidence(
      legacy.token,
      {
        projectId,
        sourceKind: "knowledge_revision",
        sourceId: knowledgeId,
        sourceVersion: "1",
        contentDigest: hash(source),
        locator: "knowledge:" + knowledgeId,
        observedAt: null,
        availability: "available",
      },
      randomUUID(),
    )
  ).record;
  const tasks = createFoundationTaskProposalService(
    createFoundationTaskProposalAccessRepository(runtime.db),
    options,
  );
  const pending = await tasks.submitTaskProposal(legacy.token, randomUUID(), {
    projectId,
    originalContent: "Pending original",
    proposedTitle: "Pending old task",
    proposedBody: "Old task body",
    rationale: "Migration preservation fixture",
  });
  const submission = await tasks.submitTaskProposal(
    legacy.token,
    randomUUID(),
    {
      projectId,
      originalContent: "Approved original",
      proposedTitle: "Approved old task",
      proposedBody: "Exact old task body",
      rationale: "Migration preservation fixture",
    },
  );
  const task = await tasks.getTaskProposal(
    { principalId: identity.principalId, expiresAt: identity.expiresAt },
    {
      projectId,
      captureId: submission.record.captureId,
    },
  );
  const taskReview = {
    projectId,
    proposalId: task.suggestion.id,
    expectedVersion: 1,
    expectedProposalDigest: task.suggestion.proposal.contentDigest,
    expectedSourceDigest: task.suggestion.proposal.binding.sourceDigest,
    decision: "approve",
    selectedTitle: task.suggestion.title,
    selectedBody: task.suggestion.body,
  };
  const reviewKey = randomUUID(),
    originalReceipt = await tasks.reviewTaskProposal(
      { principalId: identity.principalId, expiresAt: identity.expiresAt },
      reviewKey,
      taskReview,
    );
  const before = await snapshot(admin);
  assert.equal(
    Number(
      (
        await admin.pool.query(
          "select count(*) as n from drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
    ),
    64,
  );
  await migrateDatabase({
    connectionString: url("commandry_workflow_populated"),
    migrationsDir,
  });
  await migrateDatabase({
    connectionString: url("commandry_workflow_populated"),
    migrationsDir,
  });
  await migrationCount(admin);
  assert.deepEqual(
    await snapshot(admin),
    before,
    "Upgrade must preserve all existing canonical rows, grants and receipts",
  );
  assert.deepEqual(
    (
      await tasks.reviewTaskProposal(
        { principalId: identity.principalId, expiresAt: identity.expiresAt },
        reviewKey,
        taskReview,
      )
    ).record,
    originalReceipt.record,
  );
  assert.equal(
    (
      await tasks.getTaskProposal(
        { principalId: identity.principalId, expiresAt: identity.expiresAt },
        {
          projectId,
          captureId: pending.record.captureId,
        },
      )
    ).decision,
    null,
  );
  assert.deepEqual(
    await machine.getConfiguration(legacy.token, {
      projectId,
      id: candidate.id,
    }),
    candidate,
  );
  const improvements = createFoundationImprovementService(
    createFoundationImprovementAccessRepository(runtime.db),
    options,
  );
  await assert.rejects(
    improvements.list(legacy.token, { projectId, limit: 25 }),
    denied("FORBIDDEN"),
  );
  const newTables = (
    await admin.pool.query(
      "select tablename from pg_tables where schemaname='public' and (tablename like 'foundation_improvement_%' or tablename like 'foundation_finding_%' or tablename like 'foundation_onboarding_%' or tablename='resource_identity_claim') order by tablename",
    )
  ).rows;
  for (const { tablename } of newTables) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"])
      assert.equal(
        (
          await admin.pool.query(
            "select has_table_privilege($1,$2,$3) as allowed",
            [role, "public." + tablename, privilege],
          )
        ).rows[0].allowed,
        true,
        `${tablename} ${privilege}`,
      );
    assert.equal(
      (
        await admin.pool.query(
          "select exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid=$1::regclass and a.grantee=0 and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) as allowed",
          ["public." + tablename],
        )
      ).rows[0].allowed,
      false,
    );
  }
  assert.equal(
    (
      await admin.pool.query(
        "select has_schema_privilege($1,'public','CREATE') as allowed",
        [role],
      )
    ).rows[0].allowed,
    false,
  );
  await assert.rejects(
    runtime.pool.query(
      "create table public.runtime_must_not_create(id integer)",
    ),
    (error) => error.code === "42501",
  );
  const fresh = await owner.createClient(
    {
      projectId,
      name: "Post-upgrade workflow fixture",
      environment: "test",
      operations: [
        "improvement.read",
        "finding.read",
        "finding.propose",
        "onboarding.read",
        "onboarding.propose",
      ],
      ttlSeconds: 3600,
    },
    randomUUID(),
  );
  assert.equal(
    (await improvements.list(fresh.token, { projectId, limit: 25 })).items
      .length,
    0,
  );
  const findings = createFoundationFindingProposalService(
    createFoundationFindingProposalAccessRepository(runtime.db),
    options,
  );
  const finding = await findings.submitFindingProposal(
    fresh.token,
    randomUUID(),
    {
      projectId,
      originalContent: "Migration finding original",
      proposedTitle: "Migration finding",
      proposedBody: "Proposed observation, still unverified",
      rationale: "Exact canonical source",
      citations: [
        {
          evidenceId: evidence.id,
          sourceKind: evidence.sourceKind,
          sourceId: evidence.sourceId,
          sourceVersion: evidence.sourceVersion,
          contentDigest: evidence.contentDigest,
          selection: "whole_source",
        },
      ],
    },
  );
  const findingDetail = await findings.getFindingProposalOwner(identity, {
    projectId,
    id: finding.record.proposalId,
  });
  const findingReceipt = await findings.reviewFindingProposal(
    identity,
    randomUUID(),
    {
      projectId,
      proposalId: finding.record.proposalId,
      expectedVersion: 1,
      expectedProposalDigest: findingDetail.suggestion.proposal.contentDigest,
      expectedSourceDigest:
        findingDetail.suggestion.proposal.binding.sourceDigest,
      expectedCitationsDigest:
        findingDetail.suggestion.proposal.binding.citationsDigest,
      decision: "approve",
      selectedTitle: "Reviewed migration finding",
      selectedBody: "Retained unverified observation",
      reason: "Canonical filing control",
    },
  );
  assert.equal(findingReceipt.record.memory.lifecycle, "proposed");
  assert.equal(findingReceipt.record.memory.verification, "unverified");
  const onboarding = createFoundationOnboardingService(
    createFoundationOnboardingAccessRepository(runtime.db),
    options,
  );
  const onboardingProposal = await onboarding.propose(
    fresh.token,
    randomUUID(),
    {
      projectId,
      target: { mode: "reuse", resourceId: hostId },
      relationship: "relates_to",
      rationale: "Keep host identity and hierarchy",
      evidenceIds: [evidence.id],
    },
  );
  const inspected = await onboarding.preview(identity, {
    projectId,
    id: onboardingProposal.record.id,
  });
  assert.equal(inspected.canApply, true);
  const onboardingReview = await onboarding.review(identity, randomUUID(), {
    projectId,
    proposalId: onboardingProposal.record.id,
    expectedProposalDigest: onboardingProposal.record.contentDigest,
    expectedPreviewDigest: inspected.previewDigest,
    expectedDecisionVersion: 0,
    decision: "approved",
    reason: "Exact host verified for local inventory",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    inventoryReviewed: true,
  });
  const applied = await onboarding.apply(identity, randomUUID(), {
    projectId,
    proposalId: onboardingProposal.record.id,
    expectedProposalDigest: onboardingProposal.record.contentDigest,
    decisionId: onboardingReview.record.id,
    expectedDecisionVersion: onboardingReview.record.version,
    expectedDecisionDigest: onboardingReview.record.contentDigest,
  });
  assert.equal(applied.record.resourceCreated, false);
  assert.equal(applied.record.linkCreated, true);
  assert.equal(applied.record.resource.parentResourceId, providerId);
  assert.equal(applied.record.resource.id, hostId);
  console.log(
    JSON.stringify({
      scenario: "populated_0063_upgrade_twice",
      result: "PASS",
      preservedTables: tables.length,
      newTablesWithMirroredDml: newTables.length,
      historicalTaskReceipt: true,
      oldGrantDenied: true,
      realFindingFiling: true,
      reviewedInventoryApply: true,
      modelExecution: false,
    }),
  );
} finally {
  await Promise.allSettled([runtime?.close(), admin?.close(), clean?.close()]);
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
}
