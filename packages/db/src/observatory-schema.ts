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
  ObservatoryMetadata,
  ObservatoryProviderDependency,
  ObservatoryRelation,
  ObservatorySignal,
} from "@commandry/domain";
import { project, resource } from "./schema";
import { foundationClient } from "./foundation-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });

export const observatoryAnnotation = pgTable(
  "observatory_annotation",
  {
    resourceId: uuid("resource_id")
      .primaryKey()
      .references(() => resource.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    metadata: jsonb("metadata").$type<ObservatoryMetadata>().notNull(),
    requirement: text("requirement").notNull(),
  },
  (t) => [
    check(
      "observatory_annotation_valid",
      sql`${t.version} > 0 and ${t.requirement} in ('required','optional','unspecified') and ${t.metadata}->>'resourceId' = ${t.resourceId}::text`,
    ),
  ],
);
export const observatoryRelation = pgTable(
  "observatory_relation",
  {
    id: uuid("id").primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    active: boolean("active").notNull(),
    record: jsonb("record").$type<ObservatoryRelation>().notNull(),
  },
  (t) => [
    index("observatory_relation_source").on(t.sourceId, t.id),
    index("observatory_relation_target").on(t.targetId, t.id),
    check(
      "observatory_relation_valid",
      sql`${t.version} > 0 and ${t.sourceId} <> ${t.targetId} and ${t.record}->>'id' = ${t.id}::text and ${t.record}->>'sourceId' = ${t.sourceId}::text and ${t.record}->>'targetId' = ${t.targetId}::text`,
    ),
  ],
);
export const observatoryProviderMapping = pgTable(
  "observatory_provider_mapping",
  {
    id: uuid("id").primaryKey(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    providerResourceId: uuid("provider_resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    feedId: text("feed_id").notNull(),
    componentId: text("component_id").notNull(),
    version: integer("version").notNull(),
    active: boolean("active").notNull(),
    record: jsonb("record").$type<ObservatoryProviderDependency>().notNull(),
  },
  (t) => [
    index("observatory_mapping_resource").on(t.resourceId, t.id),
    check(
      "observatory_mapping_valid",
      sql`${t.version} > 0 and ${t.feedId} = 'cloudflare' and ${t.record}->>'id' = ${t.id}::text and ${t.record}->>'resourceId' = ${t.resourceId}::text and ${t.record}->>'providerId' = ${t.providerResourceId}::text`,
    ),
  ],
);
export const observatoryNamedView = pgTable(
  "observatory_named_view",
  {
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (t) => [
    index("observatory_view_owner").on(t.ownerId, t.id),
    check(
      "observatory_view_valid",
      sql`${t.version} > 0 and length(trim(${t.name})) between 1 and 100`,
    ),
  ],
);
export const observatoryClientScope = pgTable(
  "observatory_client_scope",
  {
    clientId: uuid("client_id")
      .primaryKey()
      .references(() => foundationClient.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    resourceIds: jsonb("resource_ids").$type<string[]>().notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (t) => [
    check(
      "observatory_scope_valid",
      sql`${t.version} > 0 and jsonb_typeof(${t.resourceIds}) = 'array'`,
    ),
  ],
);
export const observatorySource = pgTable(
  "observatory_source",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "restrict",
    }),
    environment: text("environment"),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    externalId: text("external_id").notNull(),
    enabled: boolean("enabled").notNull(),
    version: integer("version").notNull(),
    freshnessSeconds: integer("freshness_seconds").notNull(),
    provenance: jsonb("provenance")
      .$type<ObservatoryMetadata["provenance"]>()
      .notNull(),
    lastAttemptAt: at("last_attempt_at"),
    lastSuccessAt: at("last_success_at"),
    lastError: text("last_error"),
    failures: integer("failures").notNull().default(0),
    nextAttemptAt: at("next_attempt_at").notNull().defaultNow(),
    leaseId: uuid("lease_id"),
    leaseUntil: at("lease_until"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("observatory_source_resource").on(t.resourceId, t.id),
    index("observatory_source_due").on(t.enabled, t.nextAttemptAt),
    check(
      "observatory_source_valid",
      sql`${t.version} > 0 and ${t.kind} in ('infraagent-monitor','github-repository') and ${t.freshnessSeconds} between 30 and 86400 and ${t.failures} >= 0`,
    ),
  ],
);
export const observatoryObservation = pgTable(
  "observatory_observation",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => observatorySource.id, { onDelete: "restrict" }),
    contentDigest: text("content_digest").notNull(),
    receivedAt: at("received_at").notNull(),
    observedAt: at("observed_at"),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "restrict",
    }),
    resourceId: uuid("resource_id").references(() => resource.id, {
      onDelete: "restrict",
    }),
    sourceVersion: integer("source_version"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    signals: jsonb("signals").$type<ObservatorySignal[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceId, t.contentDigest] }),
    check(
      "observatory_observation_digest",
      sql`${t.contentDigest} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
