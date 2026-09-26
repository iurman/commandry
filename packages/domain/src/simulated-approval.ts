export const SIMULATED_ACTION_TYPE = "simulated.resource.restart" as const;
export const SIMULATED_ACTION_SCHEMA_VERSION =
  "simulated-resource-restart/v1" as const;
export const SIMULATED_ACTION_RISK = "sensitive" as const;
export const SIMULATED_ACTION_REQUIRED_CAPABILITY =
  "infrastructure.restart" as const;
export const SIMULATED_ACTION_SOURCE_LABEL =
  "Synthetic local action proposal" as const;
export const SIMULATED_ACTION_REASON =
  "Demonstrate approval review for a synthetic local resource restart." as const;
export const SIMULATED_ACTION_EXPECTED_RESULT =
  "Record a no-effect local simulation; resource state does not change." as const;
export const SIMULATED_ACTION_ROLLBACK_TRUTH =
  "No real change is made; rollback is not applicable." as const;
export const SIMULATED_ACTION_OUTCOME_SUMMARY =
  "Synthetic local restart simulation recorded. No external action occurred and resource state did not change." as const;

export type SimulatedApprovalAutomaticCeiling = "read_only" | "reversible";
export type SimulatedApprovalState =
  "pending" | "approved" | "rejected" | "cancelled" | "expired";
export type SimulatedApprovalDecision = "approve" | "reject" | "cancel";

export class SimulatedApprovalError extends Error {
  constructor(
    public readonly code:
      | "RUN_NOT_FOUND"
      | "RUN_NOT_SUCCEEDED"
      | "PACKET_NOT_FOUND"
      | "PACKET_MISMATCH"
      | "LINK_NOT_FOUND"
      | "LINK_NOT_ACTIVE"
      | "TARGET_NOT_SELECTED"
      | "PROJECT_SCOPE_DENIED"
      | "OCCURRENCE_CONFLICT"
      | "APPROVAL_NOT_FOUND"
      | "APPROVAL_NOT_PENDING"
      | "APPROVAL_EXPIRED"
      | "DIGEST_MISMATCH"
      | "SIMULATION_NOT_APPROVED",
    message: string,
  ) {
    super(message);
    this.name = "SimulatedApprovalError";
  }
}

/** The safe local range never reaches this fixed sensitive action. */
export function evaluateSimulatedActionPolicy(
  automaticCeiling: SimulatedApprovalAutomaticCeiling,
) {
  return {
    risk: SIMULATED_ACTION_RISK,
    requiredCapability: SIMULATED_ACTION_REQUIRED_CAPABILITY,
    automaticCeiling,
    approvalRequired: true as const,
    grantScope: "simulation_only" as const,
  };
}

export function isSimulatedApprovalExpired(
  expiresAt: string,
  now: Date,
): boolean {
  return Date.parse(expiresAt) <= now.getTime();
}

export function decideSimulatedApproval(input: {
  state: SimulatedApprovalState;
  expiresAt: string;
  descriptorDigest: string;
  expectedDigest: string;
  decision: SimulatedApprovalDecision;
  now: Date;
}): "approved" | "rejected" | "cancelled" {
  if (input.expectedDigest !== input.descriptorDigest) {
    throw new SimulatedApprovalError(
      "DIGEST_MISMATCH",
      "Approval digest does not match the exact action descriptor",
    );
  }
  if (
    input.state === "expired" ||
    isSimulatedApprovalExpired(input.expiresAt, input.now)
  ) {
    throw new SimulatedApprovalError(
      "APPROVAL_EXPIRED",
      "Approval request has expired",
    );
  }
  if (input.state !== "pending") {
    throw new SimulatedApprovalError(
      "APPROVAL_NOT_PENDING",
      "Approval request is no longer pending",
    );
  }
  const transitions = {
    approve: "approved",
    reject: "rejected",
    cancel: "cancelled",
  } as const;
  return transitions[input.decision];
}

export function assertSimulatedOutcomeAllowed(input: {
  state: SimulatedApprovalState;
  expiresAt: string;
  descriptorDigest: string;
  expectedDigest: string;
  now: Date;
}): void {
  if (input.expectedDigest !== input.descriptorDigest) {
    throw new SimulatedApprovalError(
      "DIGEST_MISMATCH",
      "Simulation job digest does not match the exact action descriptor",
    );
  }
  if (isSimulatedApprovalExpired(input.expiresAt, input.now)) {
    throw new SimulatedApprovalError(
      "APPROVAL_EXPIRED",
      "Approval request expired before local simulation",
    );
  }
  if (input.state !== "approved") {
    throw new SimulatedApprovalError(
      "SIMULATION_NOT_APPROVED",
      "Only an approved request can record a local simulation outcome",
    );
  }
}

/** Canonical JSON binds each action field regardless of object insertion order. */
export function canonicalSimulatedApprovalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSimulatedApprovalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalSimulatedApprovalJson(record[key])}`,
      )
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new TypeError(
      "Simulated approval descriptor is not JSON serializable",
    );
  }
  return encoded;
}
