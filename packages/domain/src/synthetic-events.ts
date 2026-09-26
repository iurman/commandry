export const SYNTHETIC_EVENT_SOURCE_VERSION = "synthetic-fixture/v1" as const;
export const SYNTHETIC_EVENT_PROCESSING_VERSION =
  "synthetic-projection/v1" as const;
export const SYNTHETIC_MONITOR_RULE_ID =
  "synthetic.monitor.availability.v1" as const;

export const syntheticScenarioRegistry = {
  "development.pr-merged": {
    eventType: "git.pull_request.merged",
    sourceKind: "synthetic-development",
    sourceLabel: "Synthetic development fixture",
    severity: "info",
    summary: "Synthetic development fixture: pull request merged",
    requiresResource: false,
  },
  "operations.monitor-down": {
    eventType: "monitor.down",
    sourceKind: "synthetic-operations",
    sourceLabel: "Synthetic operational fixture",
    severity: "critical",
    summary: "Synthetic operational fixture: monitor reported down",
    requiresResource: true,
  },
  "operations.monitor-recovered": {
    eventType: "monitor.recovered",
    sourceKind: "synthetic-operations",
    sourceLabel: "Synthetic operational fixture",
    severity: "info",
    summary: "Synthetic operational fixture: monitor reported recovery",
    requiresResource: true,
  },
} as const;

export type SyntheticScenarioId = keyof typeof syntheticScenarioRegistry;
export type SyntheticEventType =
  (typeof syntheticScenarioRegistry)[SyntheticScenarioId]["eventType"];

export function syntheticScenario(scenarioId: string) {
  if (!Object.hasOwn(syntheticScenarioRegistry, scenarioId)) {
    throw new Error(`Unknown synthetic scenario: ${scenarioId}`);
  }
  return syntheticScenarioRegistry[scenarioId as SyntheticScenarioId];
}

export type SyntheticMonitorAlertState = {
  state: "open" | "resolved";
  lastObservedAt: string;
};

export function decideSyntheticMonitorAlert(
  current: SyntheticMonitorAlertState | null,
  event: { type: SyntheticEventType; occurredAt: string },
): "open" | "refresh" | "resolve" | "ignore" {
  if (event.type === "git.pull_request.merged") return "ignore";
  if (
    current &&
    Date.parse(event.occurredAt) <= Date.parse(current.lastObservedAt)
  ) {
    return "ignore";
  }
  if (event.type === "monitor.down") {
    return current?.state === "open" ? "refresh" : "open";
  }
  return current?.state === "open" ? "resolve" : "ignore";
}

export function syntheticMonitorReason(state: "open" | "resolved") {
  return state === "open"
    ? "Synthetic monitor-down evidence opened this local attention condition. No live resource health was changed."
    : "Synthetic monitor-recovered evidence resolved this local attention condition. No live resource health was changed.";
}

export class SyntheticEventImportConflictError extends Error {
  readonly code = "OCCURRENCE_CONFLICT";

  constructor() {
    super("Occurrence ID was already used with different import details");
  }
}

export class SyntheticEventBindingError extends Error {
  constructor(
    public readonly code:
      | "PROJECT_NOT_FOUND"
      | "RESOURCE_NOT_FOUND"
      | "RESOURCE_NOT_LINKED"
      | "RESOURCE_REQUIRED",
    message: string,
  ) {
    super(message);
  }
}
