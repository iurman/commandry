export type SyntheticScenarioId =
  | "development.pr-merged"
  | "operations.monitor-down"
  | "operations.monitor-recovered";

export interface SyntheticImportRecord {
  id: string;
  occurrenceId: string;
  scenarioId: SyntheticScenarioId;
  projectId: string;
  resourceId: string | null;
  sourceKind: "synthetic-development" | "synthetic-operations";
  sourceLabel: string;
  isSynthetic: true;
  state: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  error: string | null;
  sourceEnvelopeId: string;
  eventId: string | null;
  occurredAt: string;
  receivedAt: string;
  createdAt: string;
  completedAt: string | null;
}

export interface SyntheticEventRecord {
  id: string;
  type: string;
  summary: string;
  severity: string;
  projectId: string;
  resourceId: string | null;
  occurredAt: string;
  ingestedAt: string;
  sourceEnvelopeId: string;
  sourceKind: string;
  sourceLabel: string;
  isSynthetic: true;
  processingVersion: number;
  alertId: string | null;
  evidenceHref: string;
}

export interface SyntheticAlertRecord {
  id: string;
  state: string;
  severity: string;
  ruleId: string;
  reason: string;
  projectId: string;
  resourceId: string | null;
  firstObservedAt: string;
  lastObservedAt: string;
  resolvedAt: string | null;
  lastEventId: string;
  evidenceEventIds: string[];
  sourceLabel: string;
  isSynthetic: true;
}

export interface SyntheticAttentionRecord {
  id: string;
  priority: string;
  title: string;
  reason: string;
  ruleId: string;
  alertId: string;
  projectId: string;
  resourceId: string | null;
  lastObservedAt: string;
  evidenceEventIds: string[];
  evidenceHref: string;
  sourceLabel: string;
  isSynthetic: true;
}

export function activityPagePath(
  route: string,
  options: {
    cursor?: string | null;
    projectId?: string;
    resourceId?: string;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.resourceId) params.set("resourceId", options.resourceId);
  return `${route}?${params}`;
}

export function syntheticPage<T extends { isSynthetic: true }>(
  page: PageResponse<T>,
) {
  if (page.items.some((item) => item.isSynthetic !== true)) {
    throw new Error("Unlabeled source data cannot appear in a synthetic view.");
  }
  return page;
}

export function syntheticImport(record: SyntheticImportRecord) {
  if (record.isSynthetic !== true) {
    throw new Error(
      "Unlabeled source data cannot appear in a synthetic import receipt.",
    );
  }
  return record;
}
import type { PageResponse } from "../projects/api";
