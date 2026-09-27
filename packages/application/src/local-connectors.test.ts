import { describe, expect, it, vi } from "vitest";
import type {
  LocalConnectorFeedItem,
  LocalIntegration,
  SyntheticEventImportRecord,
} from "@commandry/contracts";
import {
  createLocalConnectorService,
  type LocalConnectorPort,
} from "./local-connectors";

const instance: LocalIntegration = {
  id: "1bb13be7-1e04-493c-9776-781021b0c242",
  name: "Synthetic operational feed",
  kind: "synthetic-operations",
  projectId: "2bb13be7-1e04-493c-9776-781021b0c242",
  projectName: "Local project",
  resourceId: "3bb13be7-1e04-493c-9776-781021b0c242",
  resourceName: "Local service",
  enabled: true,
  adapterMode: "local_fixture",
  isSynthetic: true,
  receiverConfigured: true,
  freshnessWindowMinutes: 60,
  freshnessState: "unknown",
  lastObservedAt: null,
  lastReceivedAt: null,
  observationEvidenceHref: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  nextAttemptAt: null,
  cursor: null,
  latestImportId: null,
  createdAt: "2026-09-27T00:00:00.000Z",
  updatedAt: "2026-09-27T00:00:00.000Z",
};

const feed: LocalConnectorFeedItem = {
  id: "4bb13be7-1e04-493c-9776-781021b0c242",
  integrationInstanceId: instance.id,
  scenarioId: "operations.monitor-down",
  occurrenceId: "poll-one",
  occurredAt: null,
  state: "processing",
  importId: null,
  error: null,
  attempts: 1,
  createdAt: "2026-09-27T00:00:00.000Z",
  updatedAt: "2026-09-27T00:00:00.000Z",
  isSynthetic: true,
};

function fakePort(overrides: Partial<LocalConnectorPort> = {}) {
  const port = {
    get: vi.fn(async () => instance),
    resourceLinkedToProject: vi.fn(async () => true),
    submitSample: vi.fn(
      async () =>
        ({
          id: "5bb13be7-1e04-493c-9776-781021b0c242",
        }) as SyntheticEventImportRecord,
    ),
    rotateToken: vi.fn(async () => ({
      token: "cmdry_local_test_token_with_sufficient_length",
      issuedAt: instance.createdAt,
      notice: "Local synthetic receiver token; shown once" as const,
    })),
    verifyToken: vi.fn(async () => true),
    enqueue: vi.fn(async () => feed),
    list: vi.fn(async () => ({ items: [feed], nextCursor: null })),
    claimNext: vi.fn(async () => feed),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    ...overrides,
  };
  return port;
}

describe("local synthetic connector", () => {
  it("rejects an invalid receiver token before submitting an envelope", async () => {
    const port = fakePort({ verifyToken: vi.fn(async () => false) });
    const result = await createLocalConnectorService(port).receive(
      instance.id,
      "bad",
      {
        scenarioId: "operations.monitor-down",
        occurrenceId: "receiver-one",
      },
    );
    expect(result).toBeNull();
    expect(port.submitSample).not.toHaveBeenCalled();
  });

  it("binds a receiver payload to its source and marks ingress provenance", async () => {
    const port = fakePort();
    await createLocalConnectorService(port).receive(instance.id, "valid", {
      scenarioId: "operations.monitor-down",
      occurrenceId: "receiver-one",
    });
    expect(port.submitSample).toHaveBeenCalledWith(
      instance.id,
      {
        scenarioId: "operations.monitor-down",
        occurrenceId: "receiver-one",
      },
      "local-receiver",
    );
  });

  it("submits one claimed poll row through the importer and records its receipt", async () => {
    const port = fakePort();
    await createLocalConnectorService(port).processNext();
    expect(port.submitSample).toHaveBeenCalledWith(
      instance.id,
      {
        scenarioId: "operations.monitor-down",
        occurrenceId: "poll-one",
      },
      "local-poll-feed",
    );
    expect(port.complete).toHaveBeenCalledWith(
      feed.id,
      "5bb13be7-1e04-493c-9776-781021b0c242",
    );
    expect(port.fail).not.toHaveBeenCalled();
  });
});
