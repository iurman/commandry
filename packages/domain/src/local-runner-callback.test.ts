import { describe, expect, it } from "vitest";
import { evaluateLocalRunnerCallback } from "./local-runner-callback";

const now = new Date("2026-09-27T12:00:00.000Z");
const current = {
  runId: "run-1",
  attemptId: "attempt-1",
  runState: "running",
  attemptState: "running",
  tokenDigest: "a".repeat(64),
  tokenExpiresAt: new Date("2026-09-27T12:10:00.000Z"),
  grantExpiresAt: new Date("2026-09-27T12:30:00.000Z"),
  lastSequence: 0,
};
const heartbeat = {
  runId: "run-1",
  attemptId: "attempt-1",
  tokenDigest: "a".repeat(64),
  sequence: 1,
  kind: "heartbeat" as const,
  stage: "started",
  artifactName: null,
  artifactContent: null,
};

describe("local runner callback policy", () => {
  it("accepts a fresh scoped heartbeat and bounded synthetic report", () => {
    expect(evaluateLocalRunnerCallback(current, heartbeat, now)).toBe(
      "ALLOWED",
    );
    expect(
      evaluateLocalRunnerCallback(
        { ...current, lastSequence: 1 },
        {
          ...heartbeat,
          sequence: 2,
          kind: "artifact",
          stage: null,
          artifactName: "synthetic-run-report.json",
          artifactContent: JSON.stringify({
            sourceLabel: "Synthetic local runner report",
            result: "unverified",
          }),
        },
        now,
      ),
    ).toBe("ALLOWED");
  });

  it("rejects scope, token, expiry, replay, closed state, and unsafe artifacts", () => {
    expect(
      evaluateLocalRunnerCallback(
        current,
        { ...heartbeat, attemptId: "other" },
        now,
      ),
    ).toBe("CALLBACK_SCOPE_DENIED");
    expect(
      evaluateLocalRunnerCallback(
        current,
        { ...heartbeat, tokenDigest: "b".repeat(64) },
        now,
      ),
    ).toBe("CALLBACK_AUTH_DENIED");
    expect(
      evaluateLocalRunnerCallback(
        current,
        heartbeat,
        new Date("2026-09-27T12:10:00.000Z"),
      ),
    ).toBe("CALLBACK_EXPIRED");
    expect(
      evaluateLocalRunnerCallback(current, { ...heartbeat, sequence: 2 }, now),
    ).toBe("CALLBACK_SEQUENCE_CONFLICT");
    expect(
      evaluateLocalRunnerCallback(
        { ...current, runState: "canceled" },
        heartbeat,
        now,
      ),
    ).toBe("CALLBACK_RUN_NOT_ACTIVE");
    expect(
      evaluateLocalRunnerCallback(
        current,
        {
          ...heartbeat,
          kind: "artifact",
          stage: null,
          artifactName: "synthetic-run-report.json",
          artifactContent: "<script>not JSON</script>",
        },
        now,
      ),
    ).toBe("CALLBACK_PAYLOAD_INVALID");
    expect(
      evaluateLocalRunnerCallback(
        current,
        {
          ...heartbeat,
          kind: "artifact",
          stage: null,
          artifactName: "synthetic-run-report.json",
          artifactContent: JSON.stringify({
            sourceLabel: "Synthetic local runner report",
            body: "x".repeat(17_000),
          }),
        },
        now,
      ),
    ).toBe("CALLBACK_PAYLOAD_INVALID");
  });
});
