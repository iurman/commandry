import { describe, expect, it } from "vitest";
import {
  assertSimulatedOutcomeAllowed,
  canonicalSimulatedApprovalJson,
  decideSimulatedApproval,
  evaluateSimulatedActionPolicy,
  isSimulatedApprovalExpired,
  SimulatedApprovalError,
} from "./simulated-approval";

const beforeExpiry = new Date("2026-09-26T10:00:00.000Z");
const expiresAt = "2026-09-26T11:00:00.000Z";
const digest = "a".repeat(64);

describe("provisional synthetic action policy", () => {
  it("keeps the fixed sensitive action above every permitted local automatic ceiling", () => {
    for (const ceiling of ["read_only", "reversible"] as const) {
      expect(evaluateSimulatedActionPolicy(ceiling)).toEqual({
        risk: "sensitive",
        requiredCapability: "infrastructure.restart",
        automaticCeiling: ceiling,
        approvalRequired: true,
        grantScope: "simulation_only",
      });
    }
  });

  it("binds approval to the exact digest, pending state, and unexpired instant", () => {
    const base = {
      state: "pending" as const,
      expiresAt,
      descriptorDigest: digest,
      expectedDigest: digest,
      now: beforeExpiry,
    };
    expect(decideSimulatedApproval({ ...base, decision: "approve" })).toBe(
      "approved",
    );
    expect(decideSimulatedApproval({ ...base, decision: "reject" })).toBe(
      "rejected",
    );
    expect(decideSimulatedApproval({ ...base, decision: "cancel" })).toBe(
      "cancelled",
    );
    expect(() =>
      decideSimulatedApproval({
        ...base,
        decision: "approve",
        expectedDigest: "b".repeat(64),
      }),
    ).toThrowError(SimulatedApprovalError);
    expect(() =>
      decideSimulatedApproval({
        ...base,
        decision: "approve",
        state: "rejected",
      }),
    ).toThrowError(SimulatedApprovalError);
    expect(() =>
      decideSimulatedApproval({
        ...base,
        decision: "approve",
        now: new Date(expiresAt),
      }),
    ).toThrowError(SimulatedApprovalError);
    expect(isSimulatedApprovalExpired(expiresAt, new Date(expiresAt))).toBe(
      true,
    );
  });

  it("allows only a current approved no-effect worker record", () => {
    const base = {
      state: "approved" as const,
      expiresAt,
      descriptorDigest: digest,
      expectedDigest: digest,
      now: beforeExpiry,
    };
    expect(() => assertSimulatedOutcomeAllowed(base)).not.toThrow();
    for (const state of [
      "pending",
      "rejected",
      "cancelled",
      "expired",
    ] as const) {
      expect(() =>
        assertSimulatedOutcomeAllowed({ ...base, state }),
      ).toThrowError(SimulatedApprovalError);
    }
    expect(() =>
      assertSimulatedOutcomeAllowed({ ...base, now: new Date(expiresAt) }),
    ).toThrowError(SimulatedApprovalError);
    expect(() =>
      assertSimulatedOutcomeAllowed({
        ...base,
        expectedDigest: "b".repeat(64),
      }),
    ).toThrowError(SimulatedApprovalError);
  });

  it("canonicalizes nested descriptor keys before hashing", () => {
    expect(
      canonicalSimulatedApprovalJson({ b: { y: 2, x: 1 }, a: [2, 1] }),
    ).toBe(canonicalSimulatedApprovalJson({ a: [2, 1], b: { x: 1, y: 2 } }));
  });
});
