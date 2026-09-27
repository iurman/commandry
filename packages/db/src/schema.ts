import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
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

export const domain = pgTable(
  "domain",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("domain_name_id_idx").on(table.name, table.id),
    check("domain_name_nonempty", sql`length(trim(${table.name})) > 0`),
    check("domain_name_bounded", sql`length(${table.name}) <= 200`),
    check(
      "domain_description_bounded",
      sql`${table.description} is null or length(${table.description}) <= 4000`,
    ),
    check(
      "domain_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'archived')`,
    ),
    check("domain_version_positive", sql`${table.version} >= 1`),
  ],
);

export const system = pgTable(
  "system",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    summary: text("summary"),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("system_name_id_idx").on(table.name, table.id),
    check("system_name_nonempty", sql`length(trim(${table.name})) > 0`),
    check("system_name_bounded", sql`length(${table.name}) <= 200`),
    check(
      "system_summary_bounded",
      sql`${table.summary} is null or length(${table.summary}) <= 4000`,
    ),
    check(
      "system_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'archived')`,
    ),
    check("system_version_positive", sql`${table.version} >= 1`),
  ],
);

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

export const projectDomainLink = pgTable(
  "project_domain_link",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domain.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["owned_by"] })
      .notNull()
      .default("owned_by"),
    sourceKind: text("source_kind", { enum: ["project"] })
      .notNull()
      .default("project"),
    targetKind: text("target_kind", { enum: ["domain"] })
      .notNull()
      .default("domain"),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    provenance: text("provenance").notNull().default("manual"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("project_domain_link_one_active_idx")
      .on(table.projectId)
      .where(sql`${table.lifecycle} = 'active'`),
    index("project_domain_link_domain_page_idx").on(table.domainId, table.id),
    check("project_domain_link_type_valid", sql`${table.type} = 'owned_by'`),
    check(
      "project_domain_link_direction_valid",
      sql`${table.sourceKind} = 'project' and ${table.targetKind} = 'domain'`,
    ),
    check(
      "project_domain_link_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'archived')`,
    ),
    check(
      "project_domain_link_archive_consistent",
      sql`(${table.lifecycle} = 'active' and ${table.archivedAt} is null) or (${table.lifecycle} = 'archived' and ${table.archivedAt} is not null)`,
    ),
    check(
      "project_domain_link_provenance_manual",
      sql`${table.provenance} = 'manual'`,
    ),
  ],
);

export const domainAuditEvent = pgTable(
  "domain_audit_event",
  {
    id: uuid("id").primaryKey(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domain.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "restrict",
    }),
    actor: text("actor").notNull().default("local-user:unattributed"),
    operation: text("operation").notNull(),
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("domain_audit_event_domain_page_idx").on(table.domainId, table.id),
    check(
      "domain_audit_event_operation_valid",
      sql`${table.operation} in ('domain.created', 'domain.updated', 'domain.archived', 'domain.project_linked', 'domain.project_unlinked')`,
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
    parentResourceId: uuid("parent_resource_id").references(
      (): AnyPgColumn => resource.id,
      { onDelete: "restrict" },
    ),
    state: text("state"),
    externalUrl: text("external_url"),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("resource_name_id_idx").on(table.name, table.id),
    index("resource_parent_id_idx").on(table.parentResourceId, table.id),
    check("resource_kind_nonempty", sql`length(trim(${table.kind})) > 0`),
    check("resource_name_nonempty", sql`length(trim(${table.name})) > 0`),
    check(
      "resource_parent_not_self",
      sql`${table.parentResourceId} is null or ${table.parentResourceId} <> ${table.id}`,
    ),
  ],
);

export const resourceDependency = pgTable(
  "resource_dependency",
  {
    id: uuid("id").primaryKey(),
    dependentResourceId: uuid("dependent_resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    requiredResourceId: uuid("required_resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["depends_on"] })
      .notNull()
      .default("depends_on"),
    provenance: text("provenance").notNull().default("manual"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("resource_dependency_unique_idx").on(
      table.dependentResourceId,
      table.requiredResourceId,
    ),
    index("resource_dependency_required_page_idx").on(
      table.requiredResourceId,
      table.id,
    ),
    check(
      "resource_dependency_not_self",
      sql`${table.dependentResourceId} <> ${table.requiredResourceId}`,
    ),
    check("resource_dependency_type_valid", sql`${table.type} = 'depends_on'`),
    check(
      "resource_dependency_provenance_manual",
      sql`${table.provenance} = 'manual'`,
    ),
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

export const systemDomainLink = pgTable(
  "system_domain_link",
  {
    id: uuid("id").primaryKey(),
    systemId: uuid("system_id")
      .notNull()
      .references(() => system.id, { onDelete: "restrict" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domain.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["owned_by"] })
      .notNull()
      .default("owned_by"),
    sourceKind: text("source_kind", { enum: ["system"] })
      .notNull()
      .default("system"),
    targetKind: text("target_kind", { enum: ["domain"] })
      .notNull()
      .default("domain"),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    provenance: text("provenance").notNull().default("manual"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("system_domain_link_one_active_idx")
      .on(table.systemId)
      .where(sql`${table.lifecycle} = 'active'`),
    index("system_domain_link_domain_page_idx").on(table.domainId, table.id),
    check("system_domain_link_type_valid", sql`${table.type} = 'owned_by'`),
    check(
      "system_domain_link_direction_valid",
      sql`${table.sourceKind} = 'system' and ${table.targetKind} = 'domain'`,
    ),
    check(
      "system_domain_link_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'archived')`,
    ),
    check(
      "system_domain_link_archive_consistent",
      sql`(${table.lifecycle} = 'active' and ${table.archivedAt} is null) or (${table.lifecycle} = 'archived' and ${table.archivedAt} is not null)`,
    ),
    check(
      "system_domain_link_provenance_manual",
      sql`${table.provenance} = 'manual'`,
    ),
  ],
);

export const systemProjectLink = pgTable(
  "system_project_link",
  {
    id: uuid("id").primaryKey(),
    systemId: uuid("system_id")
      .notNull()
      .references(() => system.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["relates_to"] })
      .notNull()
      .default("relates_to"),
    sourceKind: text("source_kind", { enum: ["system"] })
      .notNull()
      .default("system"),
    targetKind: text("target_kind", { enum: ["project"] })
      .notNull()
      .default("project"),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    provenance: text("provenance").notNull().default("manual"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("system_project_link_one_active_idx")
      .on(table.systemId, table.projectId)
      .where(sql`${table.lifecycle} = 'active'`),
    index("system_project_link_project_page_idx").on(table.projectId, table.id),
    check("system_project_link_type_valid", sql`${table.type} = 'relates_to'`),
    check(
      "system_project_link_direction_valid",
      sql`${table.sourceKind} = 'system' and ${table.targetKind} = 'project'`,
    ),
    check(
      "system_project_link_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'archived')`,
    ),
    check(
      "system_project_link_archive_consistent",
      sql`(${table.lifecycle} = 'active' and ${table.archivedAt} is null) or (${table.lifecycle} = 'archived' and ${table.archivedAt} is not null)`,
    ),
    check(
      "system_project_link_provenance_manual",
      sql`${table.provenance} = 'manual'`,
    ),
  ],
);

export const systemResourceLink = pgTable(
  "system_resource_link",
  {
    id: uuid("id").primaryKey(),
    systemId: uuid("system_id")
      .notNull()
      .references(() => system.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["supports"] })
      .notNull()
      .default("supports"),
    sourceKind: text("source_kind", { enum: ["resource"] })
      .notNull()
      .default("resource"),
    targetKind: text("target_kind", { enum: ["system"] })
      .notNull()
      .default("system"),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    provenance: text("provenance").notNull().default("manual"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("system_resource_link_one_active_idx")
      .on(table.systemId, table.resourceId)
      .where(sql`${table.lifecycle} = 'active'`),
    index("system_resource_link_resource_page_idx").on(
      table.resourceId,
      table.id,
    ),
    check("system_resource_link_type_valid", sql`${table.type} = 'supports'`),
    check(
      "system_resource_link_direction_valid",
      sql`${table.sourceKind} = 'resource' and ${table.targetKind} = 'system'`,
    ),
    check(
      "system_resource_link_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'archived')`,
    ),
    check(
      "system_resource_link_archive_consistent",
      sql`(${table.lifecycle} = 'active' and ${table.archivedAt} is null) or (${table.lifecycle} = 'archived' and ${table.archivedAt} is not null)`,
    ),
    check(
      "system_resource_link_provenance_manual",
      sql`${table.provenance} = 'manual'`,
    ),
  ],
);

export const systemAuditEvent = pgTable(
  "system_audit_event",
  {
    id: uuid("id").primaryKey(),
    systemId: uuid("system_id")
      .notNull()
      .references(() => system.id, { onDelete: "restrict" }),
    actor: text("actor").notNull().default("local-user:unattributed"),
    operation: text("operation").notNull(),
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("system_audit_event_system_page_idx").on(table.systemId, table.id),
    check(
      "system_audit_event_operation_valid",
      sql`${table.operation} in ('system.created', 'system.updated', 'system.archived', 'system.domain_linked', 'system.domain_unlinked', 'system.project_linked', 'system.project_unlinked', 'system.resource_linked', 'system.resource_unlinked')`,
    ),
  ],
);

export const capture = pgTable(
  "capture",
  {
    id: uuid("id").primaryKey(),
    inputType: text("input_type", { enum: ["text", "url", "file"] }).notNull(),
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
      enum: ["task", "note", "link", "document"],
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
      sql`${table.inputType} in ('text', 'url', 'file')`,
    ),
    check("capture_source_manual", sql`${table.source} = 'manual-local'`),
    check("capture_author_local", sql`${table.author} = 'local-user'`),
    check(
      "capture_filing_state_valid",
      sql`(${table.state} = 'unfiled' and ${table.filedAt} is null and ${table.filedRecordKind} is null and ${table.filedRecordId} is null) or (${table.state} = 'filed' and ${table.filedAt} is not null and ${table.projectId} is not null and ${table.filedRecordKind} in ('task', 'note', 'link', 'document') and ${table.filedRecordId} is not null)`,
    ),
  ],
);

export const captureFile = pgTable(
  "capture_file",
  {
    captureId: uuid("capture_id")
      .primaryKey()
      .references(() => capture.id, { onDelete: "restrict" }),
    originalName: text("original_name").notNull(),
    mediaType: text("media_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    contentBase64: text("content_base64").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check("capture_file_name_nonempty", sql`length(${table.originalName}) > 0`),
    check(
      "capture_file_size_valid",
      sql`${table.byteSize} between 1 and 2097152`,
    ),
    check("capture_file_digest_valid", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
    check(
      "capture_file_bytes_match_size",
      sql`octet_length(decode(${table.contentBase64}, 'base64')) = ${table.byteSize}`,
    ),
  ],
);

export const captureTriageSuggestion = pgTable(
  "capture_triage_suggestion",
  {
    id: uuid("id").primaryKey(),
    captureId: uuid("capture_id")
      .notNull()
      .references(() => capture.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["task", "note"] }).notNull(),
    proposedProjectId: uuid("proposed_project_id").references(
      () => project.id,
      {
        onDelete: "restrict",
      },
    ),
    title: text("title").notNull(),
    confidence: integer("confidence").notNull(),
    rationale: text("rationale").notNull(),
    ruleVersion: text("rule_version").notNull(),
    sourceLabel: text("source_label").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("capture_triage_suggestion_capture_idx").on(table.captureId),
    check(
      "capture_triage_suggestion_kind_valid",
      sql`${table.kind} in ('task', 'note')`,
    ),
    check(
      "capture_triage_suggestion_title_nonempty",
      sql`length(trim(${table.title})) > 0`,
    ),
    check(
      "capture_triage_suggestion_confidence_valid",
      sql`${table.confidence} between 0 and 100`,
    ),
    check(
      "capture_triage_suggestion_rule_v1",
      sql`${table.ruleVersion} = 'capture-triage/v1'`,
    ),
    check(
      "capture_triage_suggestion_source_local",
      sql`${table.sourceLabel} = 'Local deterministic rule'`,
    ),
  ],
);

export const captureTriageDecision = pgTable(
  "capture_triage_decision",
  {
    id: uuid("id").primaryKey(),
    captureId: uuid("capture_id")
      .notNull()
      .references(() => capture.id, { onDelete: "restrict" }),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => captureTriageSuggestion.id, { onDelete: "restrict" }),
    decision: text("decision", { enum: ["approve", "reject"] }).notNull(),
    selectedProjectId: uuid("selected_project_id").references(
      () => project.id,
      {
        onDelete: "restrict",
      },
    ),
    selectedKind: text("selected_kind", { enum: ["task", "note"] }),
    selectedTitle: text("selected_title"),
    selectedBody: text("selected_body"),
    filedRecordId: uuid("filed_record_id"),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("capture_triage_decision_capture_idx").on(table.captureId),
    uniqueIndex("capture_triage_decision_suggestion_idx").on(
      table.suggestionId,
    ),
    check(
      "capture_triage_decision_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
    check(
      "capture_triage_decision_kind_valid",
      sql`${table.selectedKind} is null or ${table.selectedKind} in ('task', 'note')`,
    ),
    check(
      "capture_triage_decision_state_valid",
      sql`(${table.decision} = 'reject' and ${table.selectedProjectId} is null and ${table.selectedKind} is null and ${table.selectedTitle} is null and ${table.selectedBody} is null and ${table.filedRecordId} is null) or (${table.decision} = 'approve' and ${table.selectedProjectId} is not null and ${table.selectedKind} is not null and ${table.selectedTitle} is not null and ${table.selectedBody} is not null and ${table.filedRecordId} is not null)`,
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
    workType: text("work_type", { enum: ["task", "initiative", "subtask"] })
      .notNull()
      .default("task"),
    status: text("status", { enum: ["open", "done"] })
      .notNull()
      .default("open"),
    priority: text("priority", { enum: ["low", "normal", "high"] }),
    dueOn: date("due_on", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("work_item_source_capture_unique_idx").on(
      table.sourceCaptureId,
    ),
    index("work_item_project_id_idx").on(table.projectId, table.id),
    index("work_item_upcoming_idx").on(table.status, table.dueOn, table.id),
    index("work_item_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.title} || ' ' || ${table.description})`,
    ),
    check("work_item_title_nonempty", sql`length(trim(${table.title})) > 0`),
    check(
      "work_item_type_valid",
      sql`${table.workType} in ('task', 'initiative', 'subtask')`,
    ),
    check("work_item_status_valid", sql`${table.status} in ('open', 'done')`),
    check(
      "work_item_priority_valid",
      sql`${table.priority} is null or ${table.priority} in ('low', 'normal', 'high')`,
    ),
  ],
);

export const workItemPlanningEvent = pgTable(
  "work_item_planning_event",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    previousPriority: text("previous_priority", {
      enum: ["low", "normal", "high"],
    }),
    nextPriority: text("next_priority", {
      enum: ["low", "normal", "high"],
    }),
    previousDueOn: date("previous_due_on", { mode: "string" }),
    nextDueOn: date("next_due_on", { mode: "string" }),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("work_item_planning_event_page_idx").on(
      table.workItemId,
      table.createdAt,
      table.id,
    ),
    check(
      "work_item_planning_event_changed",
      sql`(${table.previousPriority} is distinct from ${table.nextPriority}) or (${table.previousDueOn} is distinct from ${table.nextDueOn})`,
    ),
    check(
      "work_item_planning_event_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
    check(
      "work_item_planning_event_priority_valid",
      sql`(${table.previousPriority} is null or ${table.previousPriority} in ('low', 'normal', 'high')) and (${table.nextPriority} is null or ${table.nextPriority} in ('low', 'normal', 'high'))`,
    ),
  ],
);

export const workItemStatusEvent = pgTable(
  "work_item_status_event",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    previousStatus: text("previous_status", {
      enum: ["open", "done"],
    }).notNull(),
    nextStatus: text("next_status", { enum: ["open", "done"] }).notNull(),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("work_item_status_event_page_idx").on(
      table.workItemId,
      table.createdAt,
      table.id,
    ),
    check(
      "work_item_status_event_changed",
      sql`${table.previousStatus} <> ${table.nextStatus}`,
    ),
    check(
      "work_item_status_event_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const workItemComment = pgTable(
  "work_item_comment",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("work_item_comment_page_idx").on(
      table.workItemId,
      table.createdAt,
      table.id,
    ),
    index("work_item_comment_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.body})`,
    ),
    check(
      "work_item_comment_body_nonempty",
      sql`length(trim(${table.body})) > 0`,
    ),
    check(
      "work_item_comment_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const workItemRelation = pgTable(
  "work_item_relation",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    sourceWorkItemId: uuid("source_work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    targetWorkItemId: uuid("target_work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["parent_of", "blocks"] }).notNull(),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    actor: text("actor").notNull().default("local-user:unattributed"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("work_item_relation_active_unique_idx")
      .on(table.type, table.sourceWorkItemId, table.targetWorkItemId)
      .where(sql`${table.state} = 'active'`),
    uniqueIndex("work_item_relation_one_parent_idx")
      .on(table.targetWorkItemId)
      .where(sql`${table.type} = 'parent_of' and ${table.state} = 'active'`),
    index("work_item_relation_source_page_idx").on(
      table.sourceWorkItemId,
      table.createdAt,
      table.id,
    ),
    index("work_item_relation_target_page_idx").on(
      table.targetWorkItemId,
      table.createdAt,
      table.id,
    ),
    check(
      "work_item_relation_not_self",
      sql`${table.sourceWorkItemId} <> ${table.targetWorkItemId}`,
    ),
    check(
      "work_item_relation_type_valid",
      sql`${table.type} in ('parent_of', 'blocks')`,
    ),
    check(
      "work_item_relation_state_valid",
      sql`(${table.state} = 'active' and ${table.archivedAt} is null) or (${table.state} = 'archived' and ${table.archivedAt} is not null)`,
    ),
    check(
      "work_item_relation_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
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
    kind: text("kind", {
      enum: [
        "note",
        "idea",
        "research",
        "requirement",
        "architecture_note",
        "runbook",
        "meeting_note",
        "lesson_learned",
        "instruction",
        "link",
        "document",
      ],
    })
      .notNull()
      .default("note"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    url: text("url"),
    version: integer("version").notNull().default(1),
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
      sql`to_tsvector('simple', ${table.title} || ' ' || ${table.content} || ' ' || coalesce(${table.url}, ''))`,
    ),
    check(
      "knowledge_item_title_nonempty",
      sql`length(trim(${table.title})) > 0`,
    ),
    check(
      "knowledge_item_kind_valid",
      sql`${table.kind} in ('note', 'idea', 'research', 'requirement', 'architecture_note', 'runbook', 'meeting_note', 'lesson_learned', 'instruction', 'link', 'document')`,
    ),
    check(
      "knowledge_item_url_valid",
      sql`(${table.kind} <> 'link' and ${table.url} is null) or (${table.kind} = 'link' and ${table.url} is not null and length(trim(${table.url})) > 0)`,
    ),
    check("knowledge_item_version_positive", sql`${table.version} > 0`),
  ],
);

export const knowledgeProjectLink = pgTable(
  "knowledge_project_link",
  {
    id: uuid("id").primaryKey(),
    knowledgeItemId: uuid("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItem.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["relates_to"] })
      .notNull()
      .default("relates_to"),
    sourceKind: text("source_kind", { enum: ["knowledge_item"] })
      .notNull()
      .default("knowledge_item"),
    targetKind: text("target_kind", { enum: ["project"] })
      .notNull()
      .default("project"),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    provenance: text("provenance").notNull().default("manual"),
    actor: text("actor").notNull().default("local-user:unattributed"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("knowledge_project_link_one_active_idx")
      .on(table.knowledgeItemId, table.projectId)
      .where(sql`${table.lifecycle} = 'active'`),
    index("knowledge_project_link_project_page_idx").on(
      table.projectId,
      table.id,
    ),
    index("knowledge_project_link_knowledge_page_idx").on(
      table.knowledgeItemId,
      table.id,
    ),
    check(
      "knowledge_project_link_type_valid",
      sql`${table.type} = 'relates_to'`,
    ),
    check(
      "knowledge_project_link_direction_valid",
      sql`${table.sourceKind} = 'knowledge_item' and ${table.targetKind} = 'project'`,
    ),
    check(
      "knowledge_project_link_lifecycle_valid",
      sql`(${table.lifecycle} = 'active' and ${table.archivedAt} is null) or (${table.lifecycle} = 'archived' and ${table.archivedAt} is not null)`,
    ),
    check(
      "knowledge_project_link_provenance_manual",
      sql`${table.provenance} = 'manual'`,
    ),
    check(
      "knowledge_project_link_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const knowledgeProjectAuditEvent = pgTable(
  "knowledge_project_audit_event",
  {
    id: uuid("id").primaryKey(),
    knowledgeItemId: uuid("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItem.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => knowledgeProjectLink.id, { onDelete: "restrict" }),
    operation: text("operation", {
      enum: ["knowledge.project_linked", "knowledge.project_unlinked"],
    }).notNull(),
    actor: text("actor").notNull().default("local-user:unattributed"),
    createdAt: createdAt(),
  },
  (table) => [
    index("knowledge_project_audit_knowledge_page_idx").on(
      table.knowledgeItemId,
      table.createdAt,
      table.id,
    ),
    check(
      "knowledge_project_audit_operation_valid",
      sql`${table.operation} in ('knowledge.project_linked', 'knowledge.project_unlinked')`,
    ),
    check(
      "knowledge_project_audit_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const workProjectLink = pgTable(
  "work_project_link",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["relates_to"] })
      .notNull()
      .default("relates_to"),
    sourceKind: text("source_kind", { enum: ["work_item"] })
      .notNull()
      .default("work_item"),
    targetKind: text("target_kind", { enum: ["project"] })
      .notNull()
      .default("project"),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    provenance: text("provenance").notNull().default("manual"),
    actor: text("actor").notNull().default("local-user:unattributed"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("work_project_link_one_active_idx")
      .on(table.workItemId, table.projectId)
      .where(sql`${table.lifecycle} = 'active'`),
    index("work_project_link_project_page_idx").on(table.projectId, table.id),
    index("work_project_link_work_page_idx").on(table.workItemId, table.id),
    check("work_project_link_type_valid", sql`${table.type} = 'relates_to'`),
    check(
      "work_project_link_direction_valid",
      sql`${table.sourceKind} = 'work_item' and ${table.targetKind} = 'project'`,
    ),
    check(
      "work_project_link_lifecycle_valid",
      sql`(${table.lifecycle} = 'active' and ${table.archivedAt} is null) or (${table.lifecycle} = 'archived' and ${table.archivedAt} is not null)`,
    ),
    check(
      "work_project_link_provenance_manual",
      sql`${table.provenance} = 'manual'`,
    ),
    check(
      "work_project_link_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const workProjectAuditEvent = pgTable(
  "work_project_audit_event",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => workProjectLink.id, { onDelete: "restrict" }),
    operation: text("operation", {
      enum: ["work.project_linked", "work.project_unlinked"],
    }).notNull(),
    actor: text("actor").notNull().default("local-user:unattributed"),
    createdAt: createdAt(),
  },
  (table) => [
    index("work_project_audit_work_page_idx").on(
      table.workItemId,
      table.createdAt,
      table.id,
    ),
    check(
      "work_project_audit_operation_valid",
      sql`${table.operation} in ('work.project_linked', 'work.project_unlinked')`,
    ),
    check(
      "work_project_audit_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const workItemAttachment = pgTable(
  "work_item_attachment",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    knowledgeItemId: uuid("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItem.id, { onDelete: "restrict" }),
    contextLinkId: uuid("context_link_id").references(
      () => knowledgeProjectLink.id,
      { onDelete: "restrict" },
    ),
    type: text("type", { enum: ["attached_document"] })
      .notNull()
      .default("attached_document"),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    actor: text("actor").notNull().default("local-user:unattributed"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("work_item_attachment_active_unique_idx")
      .on(table.workItemId, table.knowledgeItemId)
      .where(sql`${table.state} = 'active'`),
    index("work_item_attachment_work_page_idx").on(
      table.workItemId,
      table.createdAt,
      table.id,
    ),
    index("work_item_attachment_knowledge_page_idx").on(
      table.knowledgeItemId,
      table.createdAt,
      table.id,
    ),
    index("work_item_attachment_context_link_idx").on(table.contextLinkId),
    check(
      "work_item_attachment_type_valid",
      sql`${table.type} = 'attached_document'`,
    ),
    check(
      "work_item_attachment_state_valid",
      sql`(${table.state} = 'active' and ${table.archivedAt} is null) or (${table.state} = 'archived' and ${table.archivedAt} is not null)`,
    ),
    check(
      "work_item_attachment_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const workItemAcceptance = pgTable(
  "work_item_acceptance",
  {
    workItemId: uuid("work_item_id")
      .primaryKey()
      .references(() => workItem.id, { onDelete: "restrict" }),
    criteria: text("criteria").notNull(),
    version: integer("version").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("work_item_acceptance_version_positive", sql`${table.version} > 0`),
    check(
      "work_item_acceptance_criteria_length",
      sql`length(${table.criteria}) <= 10000`,
    ),
  ],
);

export const workItemAcceptanceRevision = pgTable(
  "work_item_acceptance_revision",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    criteria: text("criteria").notNull(),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("work_item_acceptance_revision_version_idx").on(
      table.workItemId,
      table.version,
    ),
    check(
      "work_item_acceptance_revision_version_positive",
      sql`${table.version} > 0`,
    ),
    check(
      "work_item_acceptance_revision_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const workItemVerification = pgTable(
  "work_item_verification",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    acceptanceVersion: integer("acceptance_version").notNull(),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => workItemAttachment.id, { onDelete: "restrict" }),
    documentTitle: text("document_title").notNull(),
    sourceCaptureId: uuid("source_capture_id")
      .notNull()
      .references(() => capture.id, { onDelete: "restrict" }),
    result: text("result", { enum: ["met", "not_met"] }).notNull(),
    note: text("note").notNull(),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("work_item_verification_page_idx").on(
      table.workItemId,
      table.createdAt,
      table.id,
    ),
    check(
      "work_item_verification_result_valid",
      sql`${table.result} in ('met', 'not_met')`,
    ),
    check(
      "work_item_verification_note_length",
      sql`length(${table.note}) <= 5000`,
    ),
    check(
      "work_item_verification_acceptance_version_positive",
      sql`${table.acceptanceVersion} > 0`,
    ),
    check(
      "work_item_verification_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const knowledgeItemRevision = pgTable(
  "knowledge_item_revision",
  {
    id: uuid("id").primaryKey(),
    knowledgeItemId: uuid("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItem.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    previousTitle: text("previous_title").notNull(),
    previousContent: text("previous_content").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("knowledge_item_revision_version_unique_idx").on(
      table.knowledgeItemId,
      table.version,
    ),
    index("knowledge_item_revision_page_idx").on(
      table.knowledgeItemId,
      table.createdAt,
      table.id,
    ),
    check(
      "knowledge_item_revision_version_positive",
      sql`${table.version} > 1`,
    ),
    check(
      "knowledge_item_revision_changed",
      sql`(${table.previousTitle} <> ${table.title}) or (${table.previousContent} <> ${table.content})`,
    ),
    check(
      "knowledge_item_revision_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const projectDecision = pgTable(
  "project_decision",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    question: text("question").notNull(),
    outcome: text("outcome").notNull(),
    alternatives: text("alternatives").notNull().default(""),
    rationale: text("rationale").notNull(),
    status: text("status", {
      enum: ["proposed", "accepted", "superseded"],
    })
      .notNull()
      .default("proposed"),
    revision: integer("revision").notNull().default(1),
    sourceLabel: text("source_label")
      .notNull()
      .default("Manual local decision"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("project_decision_project_page_idx").on(table.projectId, table.id),
    index("project_decision_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.question} || ' ' || ${table.outcome} || ' ' || ${table.rationale})`,
    ),
    check(
      "project_decision_question_nonempty",
      sql`length(trim(${table.question})) > 0`,
    ),
    check(
      "project_decision_outcome_nonempty",
      sql`length(trim(${table.outcome})) > 0`,
    ),
    check(
      "project_decision_rationale_nonempty",
      sql`length(trim(${table.rationale})) > 0`,
    ),
    check("project_decision_revision_positive", sql`${table.revision} > 0`),
    check(
      "project_decision_source_local",
      sql`${table.sourceLabel} = 'Manual local decision'`,
    ),
    check(
      "project_decision_status_valid",
      sql`${table.status} in ('proposed', 'accepted', 'superseded')`,
    ),
  ],
);

export const projectDecisionRevision = pgTable(
  "project_decision_revision",
  {
    id: uuid("id").primaryKey(),
    decisionId: uuid("decision_id")
      .notNull()
      .references(() => projectDecision.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    question: text("question").notNull(),
    outcome: text("outcome").notNull(),
    alternatives: text("alternatives").notNull(),
    rationale: text("rationale").notNull(),
    status: text("status", {
      enum: ["proposed", "accepted", "superseded"],
    }).notNull(),
    actor: text("actor").notNull().default("local-user:unattributed"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("project_decision_revision_unique_idx").on(
      table.decisionId,
      table.revision,
    ),
    check("project_decision_revision_positive", sql`${table.revision} > 0`),
    check(
      "project_decision_revision_actor_local",
      sql`${table.actor} = 'local-user:unattributed'`,
    ),
  ],
);

export const automationDefinition = pgTable(
  "automation_definition",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    routine: text("routine", { enum: ["local_project_summary_v1"] })
      .notNull()
      .default("local_project_summary_v1"),
    triggerType: text("trigger_type", {
      enum: [
        "on_creation_once",
        "recurring_interval",
        "synthetic_event",
        "synthetic_condition",
      ],
    })
      .notNull()
      .default("on_creation_once"),
    eventType: text("event_type", {
      enum: ["git.pull_request.merged", "monitor.down", "monitor.recovered"],
    }),
    conditionResourceId: uuid("condition_resource_id").references(
      () => resource.id,
      { onDelete: "restrict" },
    ),
    conditionThresholdPercent: integer("condition_threshold_percent"),
    recurrenceStartAt: timestamp("recurrence_start_at", { withTimezone: true }),
    recurrenceEveryMinutes: integer("recurrence_every_minutes"),
    nextOccurrenceAt: timestamp("next_occurrence_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    sourceOfTruth: text("source_of_truth").notNull().default("local-only"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("automation_definition_page_idx").on(table.id),
    index("automation_definition_project_page_idx").on(
      table.projectId,
      table.id,
    ),
    index("automation_definition_due_idx").on(
      table.enabled,
      table.nextOccurrenceAt,
    ),
    index("automation_definition_event_idx").on(
      table.projectId,
      table.eventType,
      table.enabled,
    ),
    index("automation_definition_condition_idx").on(
      table.projectId,
      table.conditionResourceId,
      table.enabled,
    ),
    check(
      "automation_definition_name_nonempty",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "automation_definition_routine_local",
      sql`${table.routine} = 'local_project_summary_v1'`,
    ),
    check(
      "automation_definition_trigger_valid",
      sql`${table.triggerType} in ('on_creation_once', 'recurring_interval', 'synthetic_event', 'synthetic_condition')`,
    ),
    check(
      "automation_definition_recurrence_consistent",
      sql`(${table.triggerType} = 'on_creation_once' and ${table.eventType} is null and ${table.conditionResourceId} is null and ${table.conditionThresholdPercent} is null and ${table.recurrenceStartAt} is null and ${table.recurrenceEveryMinutes} is null and ${table.nextOccurrenceAt} is null) or (${table.triggerType} = 'recurring_interval' and ${table.eventType} is null and ${table.conditionResourceId} is null and ${table.conditionThresholdPercent} is null and ${table.recurrenceStartAt} is not null and ${table.recurrenceEveryMinutes} between 5 and 10080 and ${table.nextOccurrenceAt} is not null) or (${table.triggerType} = 'synthetic_event' and ${table.eventType} in ('git.pull_request.merged', 'monitor.down', 'monitor.recovered') and ${table.conditionResourceId} is null and ${table.conditionThresholdPercent} is null and ${table.recurrenceStartAt} is null and ${table.recurrenceEveryMinutes} is null and ${table.nextOccurrenceAt} is null) or (${table.triggerType} = 'synthetic_condition' and ${table.eventType} is null and ${table.conditionResourceId} is not null and ${table.conditionThresholdPercent} between 0 and 99 and ${table.recurrenceStartAt} is null and ${table.recurrenceEveryMinutes} is null and ${table.nextOccurrenceAt} is null)`,
    ),
    check(
      "automation_definition_source_local",
      sql`${table.sourceOfTruth} = 'local-only'`,
    ),
  ],
);

export const automationRun = pgTable(
  "automation_run",
  {
    id: uuid("id").primaryKey(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => automationDefinition.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    occurrenceId: uuid("occurrence_id").notNull(),
    trigger: text("trigger", {
      enum: [
        "on_creation",
        "manual",
        "scheduled",
        "recurring",
        "synthetic_event",
        "synthetic_condition",
      ],
    }).notNull(),
    sourceEventId: uuid("source_event_id").references(
      () => normalizedEvent.id,
      {
        onDelete: "restrict",
      },
    ),
    sourceMetricSampleId: uuid("source_metric_sample_id").references(
      () => metricSample.id,
      { onDelete: "restrict" },
    ),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    state: text("state", {
      enum: ["queued", "running", "succeeded", "failed", "skipped"],
    })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    result: jsonb("result"),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("automation_run_occurrence_idx").on(table.occurrenceId),
    uniqueIndex("automation_run_recurring_due_idx")
      .on(table.definitionId, table.scheduledFor)
      .where(sql`${table.trigger} = 'recurring'`),
    uniqueIndex("automation_run_source_event_idx")
      .on(table.definitionId, table.sourceEventId)
      .where(sql`${table.sourceEventId} is not null`),
    index("automation_run_definition_page_idx").on(
      table.definitionId,
      table.id,
    ),
    index("automation_run_next_scheduled_idx").on(
      table.definitionId,
      table.state,
      table.scheduledFor,
    ),
    index("automation_run_completed_page_idx").on(table.completedAt, table.id),
    index("automation_run_project_completed_idx").on(
      table.projectId,
      table.completedAt,
      table.id,
    ),
    check("automation_run_attempts_nonnegative", sql`${table.attempts} >= 0`),
    check(
      "automation_run_trigger_valid",
      sql`${table.trigger} in ('on_creation', 'manual', 'scheduled', 'recurring', 'synthetic_event', 'synthetic_condition')`,
    ),
    check(
      "automation_run_schedule_matches_trigger",
      sql`(${table.trigger} in ('scheduled', 'recurring') and ${table.scheduledFor} is not null and ${table.sourceEventId} is null and ${table.sourceMetricSampleId} is null) or (${table.trigger} in ('on_creation', 'manual') and ${table.scheduledFor} is null and ${table.sourceEventId} is null and ${table.sourceMetricSampleId} is null) or (${table.trigger} = 'synthetic_event' and ${table.scheduledFor} is null and ${table.sourceEventId} is not null and ${table.sourceMetricSampleId} is null) or (${table.trigger} = 'synthetic_condition' and ${table.scheduledFor} is null and ${table.sourceEventId} is not null and ${table.sourceMetricSampleId} is not null)`,
    ),
    check(
      "automation_run_state_valid",
      sql`${table.state} in ('queued', 'running', 'succeeded', 'failed', 'skipped')`,
    ),
  ],
);

export const automationRunAttempt = pgTable(
  "automation_run_attempt",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => automationRun.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    state: text("state", {
      enum: ["running", "succeeded", "failed"],
    }).notNull(),
    error: text("error"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("automation_run_attempt_unique_idx").on(
      table.runId,
      table.ordinal,
    ),
    index("automation_run_attempt_page_idx").on(table.runId, table.id),
    check("automation_run_attempt_ordinal_positive", sql`${table.ordinal} > 0`),
  ],
);

export const automationAuditEvent = pgTable(
  "automation_audit_event",
  {
    id: uuid("id").primaryKey(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => automationDefinition.id, { onDelete: "restrict" }),
    runId: uuid("run_id").references(() => automationRun.id, {
      onDelete: "restrict",
    }),
    actor: text("actor").notNull(),
    operation: text("operation").notNull(),
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("automation_audit_page_idx").on(table.definitionId, table.id),
  ],
);

export const executionPacket = pgTable(
  "execution_packet",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    sourceCaptureId: uuid("source_capture_id")
      .notNull()
      .references(() => capture.id, { onDelete: "restrict" }),
    packetVersion: integer("packet_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    contentDigest: text("content_digest").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("execution_packet_work_version_idx").on(
      table.workItemId,
      table.packetVersion,
    ),
    index("execution_packet_project_generated_idx").on(
      table.projectId,
      table.generatedAt,
      table.id,
    ),
    check("execution_packet_version_positive", sql`${table.packetVersion} > 0`),
    check(
      "execution_packet_schema_version_valid",
      sql`${table.schemaVersion} = 'execution-packet/v1'`,
    ),
    check(
      "execution_packet_digest_valid",
      sql`${table.contentDigest} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const localAgentProfile = pgTable(
  "local_agent_profile",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role"),
    runtime: text("runtime").notNull().default("local-fake-v1"),
    isSynthetic: boolean("is_synthetic").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    index("local_agent_profile_created_idx").on(table.createdAt, table.id),
    check(
      "local_agent_profile_name_nonempty",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "local_agent_profile_role_nonempty",
      sql`${table.role} is null or length(trim(${table.role})) > 0`,
    ),
    check(
      "local_agent_profile_runtime_local",
      sql`${table.runtime} = 'local-fake-v1'`,
    ),
    check(
      "local_agent_profile_synthetic_only",
      sql`${table.isSynthetic} = true`,
    ),
  ],
);

export const localAgentProjectAssignment = pgTable(
  "local_agent_project_assignment",
  {
    id: uuid("id").primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => localAgentProfile.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("local_agent_project_assignment_unique_idx").on(
      table.agentId,
      table.projectId,
    ),
    index("local_agent_project_assignment_agent_idx").on(
      table.agentId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const localAgentRun = pgTable(
  "local_agent_run",
  {
    id: uuid("id").primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => localAgentProfile.id, { onDelete: "restrict" }),
    packetId: uuid("packet_id")
      .notNull()
      .references(() => executionPacket.id, { onDelete: "restrict" }),
    packetVersion: integer("packet_version").notNull(),
    packetDigest: text("packet_digest").notNull(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    occurrenceId: text("occurrence_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    state: text("state", {
      enum: ["queued", "running", "succeeded", "failed"],
    })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    isSynthetic: boolean("is_synthetic").notNull().default(true),
    verificationStatus: text("verification_status")
      .notNull()
      .default("unverified"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("local_agent_run_occurrence_idx").on(table.occurrenceId),
    index("local_agent_run_agent_created_idx").on(
      table.agentId,
      table.createdAt,
      table.id,
    ),
    index("local_agent_run_packet_idx").on(table.packetId),
    index("local_agent_run_completed_page_idx").on(table.completedAt, table.id),
    index("local_agent_run_project_completed_idx").on(
      table.projectId,
      table.completedAt,
      table.id,
    ),
    check("local_agent_run_attempts_nonnegative", sql`${table.attempts} >= 0`),
    check(
      "local_agent_run_state_valid",
      sql`${table.state} in ('queued', 'running', 'succeeded', 'failed')`,
    ),
    check("local_agent_run_synthetic_only", sql`${table.isSynthetic} = true`),
    check(
      "local_agent_run_unverified_only",
      sql`${table.verificationStatus} = 'unverified'`,
    ),
    check(
      "local_agent_run_packet_version_positive",
      sql`${table.packetVersion} > 0`,
    ),
    check(
      "local_agent_run_packet_digest_valid",
      sql`${table.packetDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "local_agent_run_occurrence_nonempty",
      sql`length(trim(${table.occurrenceId})) > 0`,
    ),
    check(
      "local_agent_run_fingerprint_valid",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const overnightQueueEntry = pgTable(
  "overnight_queue_entry",
  {
    id: uuid("id").primaryKey(),
    packetId: uuid("packet_id")
      .notNull()
      .references(() => executionPacket.id, { onDelete: "restrict" }),
    packetVersion: integer("packet_version").notNull(),
    packetDigest: text("packet_digest").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => localAgentProfile.id, { onDelete: "restrict" }),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull(),
    state: text("state", {
      enum: ["scheduled", "dispatching", "dispatched", "blocked", "canceled"],
    })
      .notNull()
      .default("scheduled"),
    runId: uuid("run_id").references(() => localAgentRun.id, {
      onDelete: "restrict",
    }),
    blockedReason: text("blocked_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("overnight_queue_page_idx").on(table.createdAt, table.id),
    index("overnight_queue_project_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    index("overnight_queue_due_idx").on(table.state, table.runAfter),
    check(
      "overnight_queue_packet_version_positive",
      sql`${table.packetVersion} > 0`,
    ),
    check(
      "overnight_queue_packet_digest_valid",
      sql`${table.packetDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "overnight_queue_state_valid",
      sql`${table.state} in ('scheduled', 'dispatching', 'dispatched', 'blocked', 'canceled')`,
    ),
  ],
);

export const overnightQueueAuditEvent = pgTable(
  "overnight_queue_audit_event",
  {
    id: uuid("id").primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => overnightQueueEntry.id, { onDelete: "restrict" }),
    actor: text("actor").notNull(),
    operation: text("operation").notNull(),
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("overnight_queue_audit_page_idx").on(table.entryId, table.id),
  ],
);

export const localMcpSession = pgTable(
  "local_mcp_session",
  {
    id: uuid("id").primaryKey(),
    packetId: uuid("packet_id")
      .notNull()
      .references(() => executionPacket.id, { onDelete: "restrict" }),
    packetVersion: integer("packet_version").notNull(),
    packetDigest: text("packet_digest").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => localAgentProfile.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("local_mcp_session_token_idx").on(table.tokenDigest),
    index("local_mcp_session_packet_page_idx").on(
      table.packetId,
      table.createdAt,
      table.id,
    ),
    check(
      "local_mcp_session_token_digest_valid",
      sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "local_mcp_session_packet_digest_valid",
      sql`${table.packetDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "local_mcp_session_packet_version_valid",
      sql`${table.packetVersion} > 0`,
    ),
    check(
      "local_mcp_session_expiry_valid",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const localMcpAuditEvent = pgTable(
  "local_mcp_audit_event",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => localMcpSession.id, { onDelete: "restrict" }),
    actor: text("actor").notNull().default("local-mcp-client:unattributed"),
    operation: text("operation").notNull(),
    decision: text("decision", { enum: ["allowed", "denied"] }).notNull(),
    code: text("code").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("local_mcp_audit_page_idx").on(
      table.sessionId,
      table.createdAt,
      table.id,
    ),
    check(
      "local_mcp_audit_actor_valid",
      sql`${table.actor} in ('local-mcp-client:unattributed','local-reviewer:unattributed')`,
    ),
    check(
      "local_mcp_audit_decision_valid",
      sql`${table.decision} in ('allowed','denied')`,
    ),
  ],
);

export const localAgentRunGrant = pgTable(
  "local_agent_run_grant",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => localAgentRun.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    operation: text("operation", {
      enum: ["project.brief.read", "work.read"],
    }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("local_agent_run_grant_unique_idx").on(
      table.runId,
      table.operation,
    ),
    index("local_agent_run_grant_run_idx").on(table.runId),
    check(
      "local_agent_run_grant_operation_valid",
      sql`${table.operation} in ('project.brief.read', 'work.read')`,
    ),
    check(
      "local_agent_run_grant_expiry_valid",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

/** The action descriptor is a historical snapshot, never a capability grant. */
export const simulatedActionProposal = pgTable(
  "simulated_action_proposal",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => localAgentRun.id, { onDelete: "restrict" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => localAgentProfile.id, { onDelete: "restrict" }),
    packetId: uuid("packet_id")
      .notNull()
      .references(() => executionPacket.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => projectResourceLink.id, { onDelete: "restrict" }),
    schemaVersion: text("schema_version").notNull(),
    descriptor: jsonb("descriptor").$type<Record<string, unknown>>().notNull(),
    descriptorDigest: text("descriptor_digest").notNull(),
    occurrenceId: text("occurrence_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("simulated_action_proposal_occurrence_idx").on(
      table.occurrenceId,
    ),
    index("simulated_action_proposal_created_idx").on(
      table.createdAt,
      table.id,
    ),
    index("simulated_action_proposal_run_idx").on(table.runId),
    index("simulated_action_proposal_project_idx").on(table.projectId),
    check(
      "simulated_action_proposal_schema_version_valid",
      sql`${table.schemaVersion} = 'simulated-resource-restart/v1'`,
    ),
    check(
      "simulated_action_proposal_digest_valid",
      sql`${table.descriptorDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "simulated_action_proposal_fingerprint_valid",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "simulated_action_proposal_occurrence_nonempty",
      sql`length(trim(${table.occurrenceId})) > 0`,
    ),
    check(
      "simulated_action_proposal_expiry_valid",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const simulatedApprovalState = pgTable(
  "simulated_approval_state",
  {
    proposalId: uuid("proposal_id")
      .primaryKey()
      .references(() => simulatedActionProposal.id, { onDelete: "restrict" }),
    state: text("state", {
      enum: ["pending", "approved", "rejected", "cancelled", "expired"],
    })
      .notNull()
      .default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("simulated_approval_state_state_idx").on(table.state),
    check(
      "simulated_approval_state_valid",
      sql`${table.state} in ('pending', 'approved', 'rejected', 'cancelled', 'expired')`,
    ),
  ],
);

export const simulatedApprovalDecision = pgTable(
  "simulated_approval_decision",
  {
    id: uuid("id").primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => simulatedActionProposal.id, { onDelete: "restrict" }),
    occurrenceId: text("occurrence_id").notNull(),
    decision: text("decision", {
      enum: ["approved", "rejected", "cancelled", "expired"],
    }).notNull(),
    expectedDigest: text("expected_digest").notNull(),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("simulated_approval_decision_once_idx").on(table.proposalId),
    uniqueIndex("simulated_approval_decision_occurrence_idx").on(
      table.occurrenceId,
    ),
    index("simulated_approval_decision_created_idx").on(
      table.proposalId,
      table.createdAt,
      table.id,
    ),
    check(
      "simulated_approval_decision_valid",
      sql`${table.decision} in ('approved', 'rejected', 'cancelled', 'expired')`,
    ),
    check(
      "simulated_approval_decision_digest_valid",
      sql`${table.expectedDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "simulated_approval_decision_occurrence_nonempty",
      sql`length(trim(${table.occurrenceId})) > 0`,
    ),
  ],
);

export const simulatedApprovalAttempt = pgTable(
  "simulated_approval_attempt",
  {
    id: uuid("id").primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => simulatedActionProposal.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    state: text("state", { enum: ["running", "succeeded", "failed"] })
      .notNull()
      .default("running"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("simulated_approval_attempt_number_idx").on(
      table.proposalId,
      table.number,
    ),
    check(
      "simulated_approval_attempt_number_positive",
      sql`${table.number} > 0`,
    ),
    check(
      "simulated_approval_attempt_state_valid",
      sql`${table.state} in ('running', 'succeeded', 'failed')`,
    ),
  ],
);

export const simulatedApprovalOutcome = pgTable(
  "simulated_approval_outcome",
  {
    proposalId: uuid("proposal_id")
      .primaryKey()
      .references(() => simulatedActionProposal.id, { onDelete: "restrict" }),
    kind: text("kind").notNull().default("simulated_only"),
    verificationStatus: text("verification_status")
      .notNull()
      .default("unverified"),
    externalActions: jsonb("external_actions").$type<unknown[]>().notNull(),
    resourceStateChanged: boolean("resource_state_changed")
      .notNull()
      .default(false),
    summary: text("summary").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "simulated_approval_outcome_kind_valid",
      sql`${table.kind} = 'simulated_only'`,
    ),
    check(
      "simulated_approval_outcome_unverified",
      sql`${table.verificationStatus} = 'unverified'`,
    ),
    check(
      "simulated_approval_outcome_no_external_actions",
      sql`${table.externalActions} = '[]'::jsonb`,
    ),
    check(
      "simulated_approval_outcome_no_resource_change",
      sql`${table.resourceStateChanged} = false`,
    ),
  ],
);

export const localAgentRunAttempt = pgTable(
  "local_agent_run_attempt",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => localAgentRun.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
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
    uniqueIndex("local_agent_run_attempt_number_idx").on(
      table.runId,
      table.number,
    ),
    index("local_agent_run_attempt_run_idx").on(
      table.runId,
      table.startedAt,
      table.id,
    ),
    check("local_agent_run_attempt_number_positive", sql`${table.number} > 0`),
    check(
      "local_agent_run_attempt_state_valid",
      sql`${table.state} in ('running', 'succeeded', 'failed')`,
    ),
  ],
);

export const integrationInstance = pgTable(
  "integration_instance",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["synthetic-development", "synthetic-operations"],
    }).notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id").references(() => resource.id, {
      onDelete: "restrict",
    }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("integration_instance_project_idx").on(table.projectId),
    index("integration_instance_created_idx").on(table.createdAt, table.id),
    check(
      "integration_instance_kind_valid",
      sql`${table.kind} in ('synthetic-development', 'synthetic-operations')`,
    ),
    check(
      "integration_instance_resource_required",
      sql`${table.kind} = 'synthetic-development' or ${table.resourceId} is not null`,
    ),
  ],
);

export const integrationInstanceAudit = pgTable(
  "integration_instance_audit",
  {
    id: uuid("id").primaryKey(),
    integrationInstanceId: uuid("integration_instance_id")
      .notNull()
      .references(() => integrationInstance.id, { onDelete: "restrict" }),
    actor: text("actor").notNull(),
    operation: text("operation").notNull(),
    details: jsonb("details")
      .$type<Record<string, string | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("integration_instance_audit_instance_idx").on(
      table.integrationInstanceId,
      table.createdAt,
      table.id,
    ),
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
    integrationInstanceId: uuid("integration_instance_id").references(
      () => integrationInstance.id,
      { onDelete: "restrict" },
    ),
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
    index("synthetic_event_import_integration_idx").on(
      table.integrationInstanceId,
      table.createdAt,
      table.id,
    ),
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

export const metricSample = pgTable(
  "metric_sample",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => normalizedEvent.id, { onDelete: "restrict" }),
    sourceEnvelopeId: uuid("source_envelope_id")
      .notNull()
      .references(() => sourceEnvelope.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    value: integer("value").notNull(),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceKind: text("source_kind").notNull(),
    sourceLabel: text("source_label").notNull(),
    isSynthetic: boolean("is_synthetic").notNull(),
  },
  (table) => [
    uniqueIndex("metric_sample_event_idx").on(table.eventId),
    index("metric_sample_resource_time_idx").on(
      table.resourceId,
      table.sampledAt,
      table.id,
    ),
    index("metric_sample_project_time_idx").on(
      table.projectId,
      table.sampledAt,
      table.id,
    ),
    check("metric_sample_name_nonempty", sql`length(trim(${table.name})) > 0`),
    check("metric_sample_unit_nonempty", sql`length(trim(${table.unit})) > 0`),
    check(
      "metric_sample_source_nonempty",
      sql`length(trim(${table.sourceLabel})) > 0`,
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
    cycle: integer("cycle").notNull().default(1),
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
    check("alert_condition_cycle_positive", sql`${table.cycle} > 0`),
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

export const notificationReceipt = pgTable(
  "notification_receipt",
  {
    id: text("id").primaryKey(),
    state: text("state", {
      enum: ["unread", "acknowledged", "dismissed", "snoozed"],
    })
      .notNull()
      .default("unread"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("notification_receipt_version_positive", sql`${table.version} > 0`),
    check(
      "notification_receipt_state_valid",
      sql`${table.state} in ('unread', 'acknowledged', 'dismissed', 'snoozed')`,
    ),
    check(
      "notification_receipt_snooze_valid",
      sql`(${table.state} = 'snoozed') = (${table.snoozedUntil} is not null)`,
    ),
  ],
);

export const notificationAuditEvent = pgTable(
  "notification_audit_event",
  {
    id: uuid("id").primaryKey(),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notificationReceipt.id, { onDelete: "restrict" }),
    actor: text("actor").notNull(),
    operation: text("operation").notNull(),
    previousState: text("previous_state").notNull(),
    nextState: text("next_state").notNull(),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("notification_audit_notification_idx").on(
      table.notificationId,
      table.createdAt,
      table.id,
    ),
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
    targetAgentRunId: uuid("target_agent_run_id").references(
      () => localAgentRun.id,
      { onDelete: "set null" },
    ),
    targetApprovalId: uuid("target_approval_id").references(
      () => simulatedActionProposal.id,
      { onDelete: "restrict" },
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
    index("audit_event_target_agent_run_idx").on(
      table.targetAgentRunId,
      table.createdAt,
      table.id,
    ),
    index("audit_event_target_approval_idx").on(
      table.targetApprovalId,
      table.createdAt,
      table.id,
    ),
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
