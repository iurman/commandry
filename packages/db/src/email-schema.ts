import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { project } from "./schema";
import type { MailDraft, MailMetadata, MailRule } from "@commandry/contracts";

export const mailAccount = pgTable(
  "mail_account",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    name: text("name").notNull(),
    provider: text("provider").notNull().default("resend"),
    domains: jsonb("domains").$type<string[]>().notNull(),
    verifiedDomains: jsonb("verified_domains")
      .$type<string[]>()
      .notNull()
      .default([]),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    error: text("error"),
    receivedCursor: uuid("received_cursor"),
    sentCursor: uuid("sent_cursor"),
    receivedComplete: boolean("received_complete").notNull().default(false),
    sentComplete: boolean("sent_complete").notNull().default(false),
    receivedDue: timestamp("received_due", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentDue: timestamp("sent_due", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rules: jsonb("rules").$type<MailRule[]>().notNull().default([]),
    rulesVersion: integer("rules_version").notNull().default(0),
    retentionDays: integer("retention_days").notNull().default(30),
  },
  (t) => [
    uniqueIndex("mail_account_primary_resend").on(t.provider),
    index("mail_account_project").on(t.projectId),
    check("mail_account_provider", sql`${t.provider} = 'resend'`),
  ],
);
export const mailMessage = pgTable(
  "mail_message",
  {
    id: uuid("id").primaryKey(),
    version: integer("version").notNull().default(1),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccount.id),
    externalId: uuid("external_id").notNull(),
    direction: text("direction").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<MailMetadata>().notNull(),
    unread: boolean("unread").notNull().default(true),
    attention: text("attention").notNull().default("open"),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    annotation: jsonb("annotation"),
    statusAt: timestamp("status_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("mail_message_external").on(
      t.accountId,
      t.externalId,
      t.direction,
    ),
    index("mail_message_page").on(t.accountId, t.occurredAt, t.id),
    check("mail_message_direction", sql`${t.direction} in ('received','sent')`),
    check(
      "mail_message_attention",
      sql`${t.attention} in ('open','reviewed','resolved')`,
    ),
  ],
);
export const mailMembership = pgTable(
  "mail_membership",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => mailMessage.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccount.id),
    address: text("address").notNull(),
    domain: text("domain").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.address] }),
    index("mail_membership_address").on(t.accountId, t.address, t.messageId),
    index("mail_membership_domain").on(t.domain, t.messageId),
  ],
);
export const mailDraft = pgTable(
  "mail_draft",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccount.id),
    payload: jsonb("payload").$type<MailDraft>().notNull(),
    state: text("state").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedBy: text("approved_by"),
    approvedUntil: timestamp("approved_until", { withTimezone: true }),
    providerId: uuid("provider_id"),
    error: text("error"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
  },
  (t) => [
    index("mail_draft_outbox").on(t.state, t.leaseUntil),
    index("mail_draft_page").on(t.accountId, t.createdAt, t.id),
    check(
      "mail_draft_state",
      sql`${t.state} in ('draft','approved','queued','sending','accepted','failed','uncertain','superseded')`,
    ),
  ],
);
export const mailEvent = pgTable(
  "mail_event",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccount.id),
    id: text("id").notNull(),
    digest: text("digest").notNull(),
    externalId: uuid("external_id").notNull(),
    direction: text("direction").notNull(),
    status: text("status").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    processed: boolean("processed").notNull().default(false),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    error: text("error"),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.id] }),
    index("mail_event_pending").on(t.processed, t.accountId),
  ],
);
export const mailAudit = pgTable("mail_audit", {
  id: uuid("id").primaryKey(),
  principalId: text("principal_id").notNull(),
  projectId: uuid("project_id"),
  operation: text("operation").notNull(),
  targetId: uuid("target_id"),
  decision: text("decision").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
