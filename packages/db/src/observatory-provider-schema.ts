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
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ProviderNotice,
  ProviderNoticeUpdate,
  ProviderStatusSnapshot,
} from "@commandry/application";
const at = (name: string) => timestamp(name, { withTimezone: true });

// Public provider evidence is shared by the single server poller. Private mappings
// and locally observed impact are stored separately and authorized before joining.
export const observatoryProviderFeed = pgTable(
  "observatory_provider_feed",
  {
    id: text("id").primaryKey(),
    enabled: boolean("enabled").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    etag: text("etag"),
    snapshot: jsonb("snapshot").$type<ProviderStatusSnapshot>(),
    lastAttemptAt: at("last_attempt_at"),
    lastSuccessAt: at("last_success_at"),
    lastError: text("last_error"),
    failures: integer("failures").notNull().default(0),
    nextAttemptAt: at("next_attempt_at").notNull().defaultNow(),
    leaseId: uuid("lease_id"),
    leaseUntil: at("lease_until"),
  },
  (table) => [
    check(
      "observatory_provider_feed_identity",
      sql`${table.id} = 'cloudflare'`,
    ),
    check(
      "observatory_provider_feed_revision",
      sql`${table.revision} > 0 and ${table.failures} >= 0`,
    ),
  ],
);
export const observatoryProviderNotice = pgTable(
  "observatory_provider_notice",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => observatoryProviderFeed.id, { onDelete: "restrict" }),
    id: text("id").notNull(),
    record: jsonb("record").$type<ProviderNotice>().notNull(),
    sourceUpdatedAt: at("source_updated_at").notNull(),
    active: boolean("active").notNull(),
    reconciledAt: at("reconciled_at"),
    lastSeenAt: at("last_seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.providerId, table.id] }),
    index("observatory_provider_notice_page").on(
      table.providerId,
      table.active,
      table.id,
    ),
  ],
);
export const observatoryProviderHistory = pgTable(
  "observatory_provider_history",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => observatoryProviderFeed.id, { onDelete: "restrict" }),
    noticeId: text("notice_id").notNull(),
    updateId: text("update_id").notNull(),
    contentDigest: text("content_digest").notNull(),
    record: jsonb("record").$type<ProviderNoticeUpdate>().notNull(),
    observedAt: at("observed_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.providerId,
        table.noticeId,
        table.updateId,
        table.contentDigest,
      ],
    }),
  ],
);

export const observatoryProviderEnvelope = pgTable(
  "observatory_provider_envelope",
  {
    id: uuid("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => observatoryProviderFeed.id, { onDelete: "restrict" }),
    contentDigest: text("content_digest").notNull().unique(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: at("received_at").notNull(),
  },
);
