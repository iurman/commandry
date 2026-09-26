import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const authSchema = { user, session, account, verification };

export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    summary: text("summary"),
    type: text("type").notNull().default("general"),
    lifecycle: text("lifecycle", {
      enum: ["proposed", "active", "paused", "completed", "archived"],
    })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("project_name_id_idx").on(table.name, table.id),
    check("project_name_nonempty", sql`length(trim(${table.name})) > 0`),
    check("project_type_nonempty", sql`length(trim(${table.type})) > 0`),
    check(
      "project_lifecycle_valid",
      sql`${table.lifecycle} in ('proposed', 'active', 'paused', 'completed', 'archived')`,
    ),
  ],
);

export const resource = pgTable(
  "resource",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    subtype: text("subtype"),
    state: text("state"),
    externalUrl: text("external_url"),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("resource_name_id_idx").on(table.name, table.id),
    check("resource_kind_nonempty", sql`length(trim(${table.kind})) > 0`),
    check("resource_name_nonempty", sql`length(trim(${table.name})) > 0`),
  ],
);

export const projectResourceLink = pgTable(
  "project_resource_link",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["supports", "relates_to"] }).notNull(),
    sourceKind: text("source_kind", {
      enum: ["project", "resource"],
    }).notNull(),
    targetKind: text("target_kind", {
      enum: ["project", "resource"],
    }).notNull(),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    provenance: text("provenance").notNull().default("manual"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("project_resource_link_unique_idx").on(
      table.projectId,
      table.resourceId,
      table.type,
    ),
    index("project_resource_link_project_id_idx").on(table.projectId, table.id),
    index("project_resource_link_resource_id_idx").on(table.resourceId),
    check(
      "project_resource_link_direction_valid",
      sql`(${table.type} = 'supports' and ${table.sourceKind} = 'resource' and ${table.targetKind} = 'project') or (${table.type} = 'relates_to' and ${table.sourceKind} = 'project' and ${table.targetKind} = 'resource')`,
    ),
    check(
      "project_resource_link_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'archived')`,
    ),
    check(
      "project_resource_link_provenance_nonempty",
      sql`length(trim(${table.provenance})) > 0`,
    ),
  ],
);

export const capture = pgTable(
  "capture",
  {
    id: uuid("id").primaryKey(),
    inputType: text("input_type", { enum: ["text", "url"] }).notNull(),
    originalContent: text("original_content").notNull(),
    source: text("source").notNull().default("manual-local"),
    author: text("author").notNull().default("local-user"),
    state: text("state", { enum: ["unfiled", "filed"] })
      .notNull()
      .default("unfiled"),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "restrict",
    }),
    filedRecordKind: text("filed_record_kind", {
      enum: ["task", "note"],
    }),
    filedRecordId: uuid("filed_record_id"),
    createdAt: createdAt(),
    filedAt: timestamp("filed_at", { withTimezone: true }),
  },
  (table) => [
    index("capture_created_id_idx").on(table.createdAt, table.id),
    index("capture_project_idx").on(table.projectId),
    index("capture_original_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.originalContent})`,
    ),
    check(
      "capture_original_nonempty",
      sql`length(trim(${table.originalContent})) > 0`,
    ),
    check(
      "capture_input_type_valid",
      sql`${table.inputType} in ('text', 'url')`,
    ),
    check("capture_source_manual", sql`${table.source} = 'manual-local'`),
    check("capture_author_local", sql`${table.author} = 'local-user'`),
    check(
      "capture_filing_state_valid",
      sql`(${table.state} = 'unfiled' and ${table.filedAt} is null and ${table.filedRecordKind} is null and ${table.filedRecordId} is null) or (${table.state} = 'filed' and ${table.filedAt} is not null and ${table.projectId} is not null and ${table.filedRecordKind} in ('task', 'note') and ${table.filedRecordId} is not null)`,
    ),
  ],
);

export const workItem = pgTable(
  "work_item",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    sourceCaptureId: uuid("source_capture_id")
      .notNull()
      .references(() => capture.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status", { enum: ["open", "done"] })
      .notNull()
      .default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("work_item_source_capture_unique_idx").on(
      table.sourceCaptureId,
    ),
    index("work_item_project_id_idx").on(table.projectId, table.id),
    index("work_item_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.title} || ' ' || ${table.description})`,
    ),
    check("work_item_title_nonempty", sql`length(trim(${table.title})) > 0`),
    check("work_item_status_valid", sql`${table.status} in ('open', 'done')`),
  ],
);

export const knowledgeItem = pgTable(
  "knowledge_item",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    sourceCaptureId: uuid("source_capture_id")
      .notNull()
      .references(() => capture.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["note"] })
      .notNull()
      .default("note"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("knowledge_item_source_capture_unique_idx").on(
      table.sourceCaptureId,
    ),
    index("knowledge_item_project_id_idx").on(table.projectId, table.id),
    index("knowledge_item_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.title} || ' ' || ${table.content})`,
    ),
    check(
      "knowledge_item_title_nonempty",
      sql`length(trim(${table.title})) > 0`,
    ),
    check("knowledge_item_kind_valid", sql`${table.kind} = 'note'`),
  ],
);

export const syntheticEventImport = pgTable(
  "synthetic_event_import",
  {
    id: uuid("id").primaryKey(),
    occurrenceId: text("occurrence_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    scenarioId: text("scenario_id", {
      enum: [
        "development.pr-merged",
        "operations.monitor-down",
        "operations.monitor-recovered",
      ],
    }).notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id").references(() => resource.id, {
      onDelete: "restrict",
    }),
    state: text("state", {
      enum: ["queued", "running", "succeeded", "failed"],
    })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("synthetic_event_import_occurrence_idx").on(table.occurrenceId),
    index("synthetic_event_import_created_idx").on(table.createdAt, table.id),
    check(
      "synthetic_event_import_scenario_valid",
      sql`${table.scenarioId} in ('development.pr-merged', 'operations.monitor-down', 'operations.monitor-recovered')`,
    ),
    check(
      "synthetic_event_import_state_valid",
      sql`${table.state} in ('queued', 'running', 'succeeded', 'failed')`,
    ),
    check(
      "synthetic_event_import_resource_required",
      sql`${table.scenarioId} = 'development.pr-merged' or ${table.resourceId} is not null`,
    ),
    check(
      "synthetic_event_import_attempts_nonnegative",
      sql`${table.attempts} >= 0`,
    ),
  ],
);

export const sourceEnvelope = pgTable(
  "source_envelope",
  {
    id: uuid("id").primaryKey(),
    importId: uuid("import_id")
      .notNull()
      .references(() => syntheticEventImport.id, { onDelete: "restrict" }),
    sourceKind: text("source_kind", {
      enum: ["synthetic-development", "synthetic-operations"],
    }).notNull(),
    sourceLabel: text("source_label").notNull(),
    sourceSchemaVersion: text("source_schema_version").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    rawPayload: jsonb("raw_payload")
      .$type<Record<string, string | null>>()
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isSynthetic: boolean("is_synthetic").notNull().default(true),
  },
  (table) => [
    uniqueIndex("source_envelope_import_idx").on(table.importId),
    uniqueIndex("source_envelope_source_event_idx").on(
      table.sourceKind,
      table.sourceEventId,
    ),
    check("source_envelope_synthetic_only", sql`${table.isSynthetic} = true`),
    check(
      "source_envelope_kind_valid",
      sql`${table.sourceKind} in ('synthetic-development', 'synthetic-operations')`,
    ),
    check(
      "source_envelope_version_valid",
      sql`${table.sourceSchemaVersion} = 'synthetic-fixture/v1'`,
    ),
  ],
);

export const normalizedEvent = pgTable(
  "normalized_event",
  {
    id: uuid("id").primaryKey(),
    importId: uuid("import_id")
      .notNull()
      .references(() => syntheticEventImport.id, { onDelete: "restrict" }),
    sourceEnvelopeId: uuid("source_envelope_id")
      .notNull()
      .references(() => sourceEnvelope.id, { onDelete: "restrict" }),
    type: text("type", {
      enum: ["git.pull_request.merged", "monitor.down", "monitor.recovered"],
    }).notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id").references(() => resource.id, {
      onDelete: "restrict",
    }),
    severity: text("severity", { enum: ["info", "critical"] }).notNull(),
    summary: text("summary").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceKind: text("source_kind", {
      enum: ["synthetic-development", "synthetic-operations"],
    }).notNull(),
    sourceLabel: text("source_label").notNull(),
    processingVersion: text("processing_version").notNull(),
    isSynthetic: boolean("is_synthetic").notNull().default(true),
  },
  (table) => [
    uniqueIndex("normalized_event_import_idx").on(table.importId),
    uniqueIndex("normalized_event_envelope_idx").on(table.sourceEnvelopeId),
    index("normalized_event_time_idx").on(table.occurredAt, table.id),
    index("normalized_event_project_idx").on(table.projectId),
    index("normalized_event_resource_idx").on(table.resourceId),
    check("normalized_event_synthetic_only", sql`${table.isSynthetic} = true`),
    check(
      "normalized_event_type_valid",
      sql`${table.type} in ('git.pull_request.merged', 'monitor.down', 'monitor.recovered')`,
    ),
  ],
);

export const alertCondition = pgTable(
  "alert_condition",
  {
    id: uuid("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    state: text("state", { enum: ["open", "resolved"] }).notNull(),
    severity: text("severity", { enum: ["critical"] })
      .notNull()
      .default("critical"),
    reason: text("reason").notNull(),
    firstObservedAt: timestamp("first_observed_at", {
      withTimezone: true,
    }).notNull(),
    lastObservedAt: timestamp("last_observed_at", {
      withTimezone: true,
    }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastEventId: uuid("last_event_id")
      .notNull()
      .references(() => normalizedEvent.id, { onDelete: "restrict" }),
    sourceKind: text("source_kind").notNull(),
    sourceLabel: text("source_label").notNull(),
    isSynthetic: boolean("is_synthetic").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("alert_condition_subject_rule_idx").on(
      table.ruleId,
      table.projectId,
      table.resourceId,
    ),
    index("alert_condition_updated_idx").on(table.updatedAt, table.id),
    index("alert_condition_project_idx").on(table.projectId),
    check("alert_condition_synthetic_only", sql`${table.isSynthetic} = true`),
    check(
      "alert_condition_state_valid",
      sql`${table.state} in ('open', 'resolved')`,
    ),
  ],
);

export const alertEvidence = pgTable(
  "alert_evidence",
  {
    id: uuid("id").primaryKey(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alertCondition.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => normalizedEvent.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("alert_evidence_unique_idx").on(table.alertId, table.eventId),
    index("alert_evidence_alert_idx").on(table.alertId),
  ],
);

export const syntheticEventImportAttempt = pgTable(
  "synthetic_event_import_attempt",
  {
    id: uuid("id").primaryKey(),
    importId: uuid("import_id")
      .notNull()
      .references(() => syntheticEventImport.id, { onDelete: "restrict" }),
    state: text("state", {
      enum: ["running", "succeeded", "failed"],
    }).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("synthetic_event_import_attempt_import_idx").on(table.importId),
    check(
      "synthetic_event_import_attempt_state_valid",
      sql`${table.state} in ('running', 'succeeded', 'failed')`,
    ),
  ],
);

export const syntheticRun = pgTable(
  "synthetic_run",
  {
    id: uuid("id").primaryKey(),
    occurrenceId: text("occurrence_id").notNull(),
    state: text("state", { enum: ["queued", "running", "succeeded", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    result: text("result"),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("synthetic_run_occurrence_id_idx").on(table.occurrenceId),
    check(
      "synthetic_run_state_valid",
      sql`${table.state} in ('queued', 'running', 'succeeded', 'failed')`,
    ),
    check("synthetic_run_attempts_nonnegative", sql`${table.attempts} >= 0`),
    check(
      "synthetic_run_occurrence_nonempty",
      sql`length(trim(${table.occurrenceId})) > 0`,
    ),
  ],
);

export const syntheticRunAttempt = pgTable(
  "synthetic_run_attempt",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => syntheticRun.id, { onDelete: "cascade" }),
    state: text("state", {
      enum: ["running", "succeeded", "failed"],
    }).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("synthetic_run_attempt_run_idx").on(table.runId),
    check(
      "synthetic_run_attempt_state_valid",
      sql`${table.state} in ('running', 'succeeded', 'failed')`,
    ),
  ],
);

export const syntheticRunEffect = pgTable("synthetic_run_effect", {
  runId: uuid("run_id")
    .primaryKey()
    .references(() => syntheticRun.id, { onDelete: "cascade" }),
  result: text("result").notNull(),
  createdAt: createdAt(),
});

export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey(),
    actor: text("actor").notNull(),
    operation: text("operation").notNull(),
    targetRunId: uuid("target_run_id").references(() => syntheticRun.id, {
      onDelete: "set null",
    }),
    targetImportId: uuid("target_import_id").references(
      () => syntheticEventImport.id,
      { onDelete: "set null" },
    ),
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_event_target_run_idx").on(table.targetRunId),
    index("audit_event_target_import_idx").on(table.targetImportId),
  ],
);

export const workerHeartbeat = pgTable("worker_heartbeat", {
  workerId: uuid("worker_id").primaryKey(),
  releaseSha: text("release_sha").notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
});

export const syntheticRunRelations = relations(
  syntheticRun,
  ({ many, one }) => ({
    attempts: many(syntheticRunAttempt),
    effect: one(syntheticRunEffect),
  }),
);
