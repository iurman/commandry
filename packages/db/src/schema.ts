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
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [index("audit_event_target_run_idx").on(table.targetRunId)],
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
