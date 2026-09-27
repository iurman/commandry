import { describe, expect, it } from "vitest";
import {
  metricDropSignal,
  sourceStalenessSignal,
  type MetricPair,
  type SourceObservation,
} from "./local-attention";

const asOf = new Date("2026-09-27T12:00:00.000Z");
const source: SourceObservation = {
  integrationId: "6d11fc24-990d-4f4c-9b32-8f947538a67c",
  integrationName: "Synthetic operations feed",
  projectId: "2b50204d-ed03-46f6-96d9-fdb6fe53f1ad",
  projectName: "Harbor",
  resourceId: null,
  resourceName: null,
  windowMinutes: 60,
  envelopeId: "f0e0a1e4-e9db-4851-9eac-d32ad4d60ea2",
  observedAt: "2026-09-27T10:00:00.000Z",
};
const metric: MetricPair = {
  projectId: source.projectId,
  projectName: source.projectName,
  resourceId: "fa6a8806-4b72-4af8-b3b8-c4a168c42b65",
  resourceName: "Synthetic monitor",
  latestId: "61aca4f2-249a-46cb-8bd9-65cbbda920da",
  latestAt: "2026-09-27T11:55:00.000Z",
  latestValue: 50,
  previousId: "dc01036e-4a29-473f-9682-07fbb058a3d8",
  previousAt: "2026-09-27T11:50:00.000Z",
  previousValue: 100,
};

describe("local synthetic attention rules", () => {
  it("shows stale observed data with exact source evidence and no real health claim", () => {
    expect(sourceStalenessSignal(source, asOf)).toMatchObject({
      key: `source_stale:${source.integrationId}`,
      evidenceId: source.envelopeId,
      threshold: 60,
    });
    expect(sourceStalenessSignal(source, asOf)?.reason).toContain(
      "does not establish real source health",
    );
    expect(
      sourceStalenessSignal(
        { ...source, observedAt: "2026-09-27T11:30:00.000Z" },
        asOf,
      ),
    ).toBeNull();
    expect(
      sourceStalenessSignal({ ...source, envelopeId: null }, asOf),
    ).toBeNull();
  });

  it("requires two recent samples and a configurable material drop", () => {
    expect(metricDropSignal(metric, 25, asOf)).toMatchObject({
      evidenceId: metric.latestId,
      previousEvidenceId: metric.previousId,
      previousValue: 100,
      latestValue: 50,
    });
    expect(metricDropSignal(metric, 60, asOf)).toBeNull();
    expect(
      metricDropSignal({ ...metric, previousId: null }, 25, asOf),
    ).toBeNull();
    expect(
      metricDropSignal(
        { ...metric, latestAt: "2026-09-25T11:55:00.000Z" },
        25,
        asOf,
      ),
    ).toBeNull();
  });
});
