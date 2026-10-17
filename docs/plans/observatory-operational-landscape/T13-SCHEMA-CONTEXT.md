# T13 captured database interfaces

**Status: Operational source capture.**

These are exact local source excerpts at d438d07. They are read context, not duplicate implementation. Import the canonical modules; do not copy their implementations.

Source `packages/db/src/schema.ts`, SHA256 d3d2e91fca4923492de501cfb5f44f929773db51fd3995bc147878e1032ed158.

```ts
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
```

```ts
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
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("project_name_id_idx").on(table.name, table.id),
    check("project_name_nonempty", sql`length(trim(${table.name})) > 0`),
    check("project_name_bounded", sql`length(${table.name}) <= 200`),
    check("project_type_nonempty", sql`length(trim(${table.type})) > 0`),
    check("project_type_bounded", sql`length(${table.type}) <= 100`),
    check(
      "project_summary_bounded",
      sql`${table.summary} is null or length(${table.summary}) <= 4000`,
    ),
    check("project_version_positive", sql`${table.version} >= 1`),
    check(
      "project_lifecycle_valid",
      sql`${table.lifecycle} in ('proposed', 'active', 'paused', 'completed', 'archived')`,
```

```ts
export const capture = pgTable(
  "capture",
  {
    id: uuid("id").primaryKey(),
    inputType: text("input_type", {
      enum: [
        "text",
        "email",
        "conversation",
        "voice_transcript",
        "url",
        "file",
      ],
    }).notNull(),
    originalContent: text("original_content").notNull(),
    source: text("source", {
      enum: ["manual-local", "automation-local-synthetic", "foundation-client"],
    })
      .notNull()
      .default("manual-local"),
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
    uniqueIndex("capture_id_project_unique_idx").on(table.id, table.projectId),
    index("capture_original_search_idx").using(
      "gin",
```

```ts
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
    generatedFromWorkItemId: uuid("generated_from_work_item_id").references(
      (): AnyPgColumn => workItem.id,
      { onDelete: "restrict" },
    ),
    title: text("title").notNull(),
    description: text("description").notNull(),
    workType: text("work_type", { enum: ["task", "initiative", "subtask"] })
      .notNull()
      .default("task"),
    assigneeKind: text("assignee_kind", {
      enum: ["unassigned", "local_user", "agent"],
    })
      .notNull()
      .default("unassigned"),
    assigneeAgentId: uuid("assignee_agent_id"),
    assigneeLabel: text("assignee_label"),
    status: text("status", { enum: ["open", "done"] })
      .notNull()
      .default("open"),
    priority: text("priority", { enum: ["low", "normal", "high"] }),
    dueOn: date("due_on", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("work_item_source_capture_unique_idx")
      .on(table.sourceCaptureId)
      .where(sql`${table.generatedFromWorkItemId} is null`),
    index("work_item_generated_from_idx").on(
      table.generatedFromWorkItemId,
      table.id,
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
      "work_item_not_generated_from_self",
      sql`${table.generatedFromWorkItemId} is null or ${table.generatedFromWorkItemId} <> ${table.id}`,
    ),
    check(
      "work_item_priority_valid",
      sql`${table.priority} is null or ${table.priority} in ('low', 'normal', 'high')`,
    ),
    check(
      "work_item_assignee_valid",
      sql`(${table.assigneeKind} = 'unassigned' and ${table.assigneeAgentId} is null and ${table.assigneeLabel} is null) or (${table.assigneeKind} = 'local_user' and ${table.assigneeAgentId} is null and ${table.assigneeLabel} = 'Local user (unattributed)') or (${table.assigneeKind} = 'agent' and ${table.assigneeAgentId} is not null and ${table.assigneeLabel} like 'Synthetic local agent: %')`,
    ),
    foreignKey({
      columns: [table.assigneeAgentId, table.projectId],
      foreignColumns: [
        localAgentProjectAssignment.agentId,
        localAgentProjectAssignment.projectId,
      ],
      name: "work_item_assignee_project_scope_fk",
    }),
  ],
);

export const workItemAssignmentEvent = pgTable(
  "work_item_assignment_event",
  {
    id: uuid("id").primaryKey(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "restrict" }),
    previousKind: text("previous_kind", {
      enum: ["unassigned", "local_user", "agent"],
    }).notNull(),
    nextKind: text("next_kind", {
      enum: ["unassigned", "local_user", "agent"],
    }).notNull(),
    previousAgentId: uuid("previous_agent_id"),
    nextAgentId: uuid("next_agent_id"),
    previousLabel: text("previous_label"),
    nextLabel: text("next_label"),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
```

```ts
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
```

Source `packages/db/src/foundation-workflow-access-repository.ts`, SHA256 66bf9028de3da7dde480fddb95d32908dab9e9c369678bb50fbf0f375aee7bf7.

```ts
/** Only a trusted HTTP adapter supplies sessionId. Lock its actual canonical row
 * through the operation/allowed audit/COMMIT; a body-supplied owner marker is not
 * authority. No cookie, token, email or session identifier enters audit payloads. */
export async function requireWorkflowOwnerSession(
  database: Pick<CommandryDatabase, "select">,
  request: Pick<
    FoundationOwnerRequest,
    "principalId" | "expiresAt" | "sessionId"
  >,
  now: Date,
  lock: boolean,
) {
  if (
    typeof request.sessionId !== "string" ||
    !request.sessionId.trim() ||
    request.sessionId.length > 500 ||
    !request.principalId.startsWith("user:") ||
    !request.principalId.slice(5).trim() ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  )
    throw new FoundationError("FORBIDDEN", "A live owner session is required");
  const query = database
    .select({ expiresAt: session.expiresAt })
    .from(session)
    .where(
      and(
        eq(session.id, request.sessionId),
        eq(session.userId, request.principalId.slice(5)),
      ),
    );
  const [row] = lock ? await query.for("share") : await query;
  const claimedExpiry = foundationInstantMilliseconds(request.expiresAt);
  if (!row)
    throw new FoundationError("FORBIDDEN", "A live owner session is required");
  if (
    !(row.expiresAt instanceof Date) ||
    !Number.isFinite(row.expiresAt.getTime()) ||
    !Number.isFinite(claimedExpiry) ||
    claimedExpiry > row.expiresAt.getTime() ||
    claimedExpiry <= now.getTime() ||
    row.expiresAt.getTime() <= now.getTime()
  )
    throw new FoundationError("EXPIRED", "Owner session expired");
}

```
