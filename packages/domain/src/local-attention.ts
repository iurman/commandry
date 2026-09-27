import { classifyObservationFreshness } from "./integrations";

export const LOCAL_ATTENTION_DEFAULTS = {
  staleSourceEnabled: true,
  metricDropEnabled: true,
  metricDropPoints: 25,
} as const;

export const LOCAL_ATTENTION_POLICY = {
  risk: "reversible",
  capability: "local_attention.rules.manage",
  approvalRequired: false,
  auditEvent: "local_attention.rules_changed",
  externalActions: false,
} as const;

export const LOCAL_ATTENTION_REVIEW_POLICY = {
  risk: "reversible",
  capability: "local_attention.signal.review",
  approvalRequired: false,
  auditEvent: "local_attention.reviewed",
  externalActions: false,
} as const;

export class LocalAttentionError extends Error {
  constructor(
    public readonly code:
      | "SETTINGS_STALE"
      | "INVALID_CURSOR"
      | "SIGNAL_NOT_FOUND"
      | "SIGNAL_REVIEW_STALE"
      | "INVALID_SNOOZE",
    message: string,
  ) {
    super(message);
  }
}

export function validateLocalAttentionReview(
  input: {
    disposition: "visible" | "snoozed" | "dismissed";
    snoozedUntil: string | null;
  },
  now = new Date(),
) {
  if (input.disposition !== "snoozed" && input.snoozedUntil !== null)
    throw new LocalAttentionError(
      "INVALID_SNOOZE",
      "Only a snoozed signal may have a reminder time",
    );
  if (input.disposition === "snoozed") {
    const until = input.snoozedUntil
      ? new Date(input.snoozedUntil).getTime()
      : Number.NaN;
    if (
      !Number.isFinite(until) ||
      until <= now.getTime() ||
      until > now.getTime() + 7 * 24 * 60 * 60_000
    )
      throw new LocalAttentionError(
        "INVALID_SNOOZE",
        "Snooze must end within the next seven days",
      );
  }
}

export type SourceObservation = {
  integrationId: string;
  integrationName: string;
  projectId: string;
  projectName: string;
  resourceId: string | null;
  resourceName: string | null;
  windowMinutes: number;
  envelopeId: string | null;
  observedAt: string | null;
};

export type MetricPair = {
  projectId: string;
  projectName: string;
  resourceId: string;
  resourceName: string;
  latestId: string;
  latestAt: string;
  latestValue: number;
  previousId: string | null;
  previousAt: string | null;
  previousValue: number | null;
};

export type DesiredLocalAttentionSignal = {
  key: string;
  ruleId: "source_stale" | "metric_drop";
  projectId: string;
  integrationId: string | null;
  resourceId: string | null;
  evidenceKind: "source_envelope" | "metric_sample";
  evidenceId: string;
  previousEvidenceId: string | null;
  reason: string;
  observedAt: string;
  previousObservedAt: string | null;
  previousValue: number | null;
  latestValue: number | null;
  threshold: number;
};

export function sourceStalenessSignal(
  source: SourceObservation,
  asOf: Date,
): DesiredLocalAttentionSignal | null {
  if (
    !source.envelopeId ||
    !source.observedAt ||
    classifyObservationFreshness(
      new Date(source.observedAt),
      source.windowMinutes,
      asOf,
    ) !== "stale"
  )
    return null;
  return {
    key: `source_stale:${source.integrationId}`,
    ruleId: "source_stale",
    projectId: source.projectId,
    integrationId: source.integrationId,
    resourceId: source.resourceId,
    evidenceKind: "source_envelope",
    evidenceId: source.envelopeId,
    previousEvidenceId: null,
    reason: `The last synthetic observation for ${source.integrationName} was at ${source.observedAt}; its ${source.windowMinutes}-minute freshness window has elapsed. This does not establish real source health.`,
    observedAt: source.observedAt,
    previousObservedAt: null,
    previousValue: null,
    latestValue: null,
    threshold: source.windowMinutes,
  };
}

export function metricDropSignal(
  metric: MetricPair,
  dropPoints: number,
  asOf: Date,
): DesiredLocalAttentionSignal | null {
  if (
    !metric.previousId ||
    !metric.previousAt ||
    metric.previousValue === null ||
    metric.previousValue - metric.latestValue < dropPoints ||
    Date.parse(metric.latestAt) > asOf.getTime() ||
    asOf.getTime() - Date.parse(metric.latestAt) > 24 * 60 * 60_000
  )
    return null;
  return {
    key: `metric_drop:${metric.projectId}:${metric.resourceId}`,
    ruleId: "metric_drop",
    projectId: metric.projectId,
    integrationId: null,
    resourceId: metric.resourceId,
    evidenceKind: "metric_sample",
    evidenceId: metric.latestId,
    previousEvidenceId: metric.previousId,
    reason: `Synthetic availability for ${metric.resourceName} fell from ${metric.previousValue}% at ${metric.previousAt} to ${metric.latestValue}% at ${metric.latestAt}, meeting the ${dropPoints}-point drop rule. This does not establish real resource health.`,
    observedAt: metric.latestAt,
    previousObservedAt: metric.previousAt,
    previousValue: metric.previousValue,
    latestValue: metric.latestValue,
    threshold: dropPoints,
  };
}
