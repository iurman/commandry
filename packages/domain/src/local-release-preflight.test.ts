import { describe, expect, it } from "vitest";
import {
  assessLocalReleasePreflight,
  type LocalReleasePreflightChecks,
} from "./local-release-preflight";

const passed: LocalReleasePreflightChecks = {
  postgresHealthy: true,
  webHealthy: true,
  workerHealthy: true,
  migrationExited: true,
  revisionKnown: true,
  sameImage: true,
  versionReachable: true,
  apiRead: true,
  heartbeatFresh: true,
  localEvidence: true,
};

describe("local release preflight", () => {
  it("passes only when all local service, read, and evidence checks pass", () => {
    expect(assessLocalReleasePreflight(passed)).toEqual({
      outcome: "passed",
      errorCode: null,
    });
    expect(
      assessLocalReleasePreflight({ ...passed, localEvidence: false }),
    ).toEqual({
      outcome: "failed",
      errorCode: "LOCAL_EVIDENCE_INCOMPLETE",
    });
  });

  it("reports the first failed dependency before later symptoms", () => {
    expect(
      assessLocalReleasePreflight({
        ...passed,
        postgresHealthy: false,
        apiRead: false,
        heartbeatFresh: false,
      }),
    ).toEqual({ outcome: "failed", errorCode: "POSTGRES_UNHEALTHY" });
  });
});
