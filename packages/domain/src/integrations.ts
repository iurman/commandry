import type { SyntheticScenarioId } from "./synthetic-events";

export type LocalIntegrationKind =
  "synthetic-development" | "synthetic-operations";

export class LocalIntegrationError extends Error {
  constructor(
    public readonly code:
      | "PROJECT_NOT_FOUND"
      | "RESOURCE_REQUIRED"
      | "RESOURCE_NOT_LINKED"
      | "INTEGRATION_NOT_FOUND"
      | "INTEGRATION_DISABLED"
      | "SCENARIO_MISMATCH",
    message: string,
  ) {
    super(message);
  }
}

export function requireLocalIntegrationScenario(
  kind: LocalIntegrationKind,
  scenarioId: SyntheticScenarioId,
): void {
  const matches =
    kind === "synthetic-development"
      ? scenarioId === "development.pr-merged"
      : scenarioId === "operations.monitor-down" ||
        scenarioId === "operations.monitor-recovered";
  if (!matches) {
    throw new LocalIntegrationError(
      "SCENARIO_MISMATCH",
      "This sample does not belong to the configured source category",
    );
  }
}
