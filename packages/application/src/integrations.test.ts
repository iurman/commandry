import { describe, expect, it, vi } from "vitest";
import type {
  LocalIntegration,
  SyntheticEventImportRecord,
} from "@commandry/contracts";
import {
  createLocalIntegrationService,
  type LocalIntegrationPort,
} from "./integrations";
import type { PreparedSyntheticEventImport } from "./synthetic-events";

const fixture: LocalIntegration = {
  id: "1bb13be7-1e04-493c-9776-781021b0c242",
  name: "Test operations feed",
  kind: "synthetic-operations",
  projectId: "2bb13be7-1e04-493c-9776-781021b0c242",
  projectName: "Test project",
  resourceId: "3bb13be7-1e04-493c-9776-781021b0c242",
  resourceName: "Test service",
  enabled: true,
  adapterMode: "local_fixture",
  isSynthetic: true,
  receiverConfigured: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  nextAttemptAt: null,
  cursor: null,
  latestImportId: null,
  createdAt: "2026-09-26T10:00:00.000Z",
  updatedAt: "2026-09-26T10:00:00.000Z",
};

function port(instance: LocalIntegration | null = fixture) {
  const submitOnce = vi.fn(
    async (input: PreparedSyntheticEventImport) =>
      ({ id: input.occurrenceId }) as SyntheticEventImportRecord,
  );
  const resourceLinkedToProject = vi.fn(async () => true);
  const value = {
    create: vi.fn(),
    get: vi.fn(async () => instance),
    list: vi.fn(),
    setEnabled: vi.fn(),
    resourceLinkedToProject,
    submitOnce,
  } as unknown as LocalIntegrationPort;
  return { value, submitOnce, resourceLinkedToProject };
}

describe("configured sample submission", () => {
  const input = {
    scenarioId: "operations.monitor-down" as const,
    occurrenceId: "same-source-event",
  };

  it("binds source identity, project, and resource into one replayable import", async () => {
    const fake = port();
    const service = createLocalIntegrationService(fake.value);
    await service.submitSample(fixture.id, input);
    await service.submitSample(fixture.id, input);
    expect(fake.submitOnce).toHaveBeenCalledTimes(2);
    expect(fake.submitOnce.mock.calls[0]?.[0]).toEqual(
      fake.submitOnce.mock.calls[1]?.[0],
    );
    expect(fake.submitOnce.mock.calls[0]?.[0]).toMatchObject({
      integrationInstanceId: fixture.id,
      projectId: fixture.projectId,
      resourceId: fixture.resourceId,
      sourceKind: "synthetic-operations",
      sourceLabel: "Synthetic operational fixture",
    });
  });

  it("rejects disabled, mismatched, and unlinked samples before enqueue", async () => {
    const disabled = port({ ...fixture, enabled: false });
    await expect(
      createLocalIntegrationService(disabled.value).submitSample(
        fixture.id,
        input,
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISABLED" });
    const mismatch = port();
    await expect(
      createLocalIntegrationService(mismatch.value).submitSample(fixture.id, {
        scenarioId: "development.pr-merged",
        occurrenceId: "wrong-category",
      }),
    ).rejects.toMatchObject({ code: "SCENARIO_MISMATCH" });
    const unlinked = port();
    unlinked.resourceLinkedToProject.mockResolvedValue(false);
    await expect(
      createLocalIntegrationService(unlinked.value).submitSample(
        fixture.id,
        input,
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_LINKED" });
    expect(disabled.submitOnce).not.toHaveBeenCalled();
    expect(mismatch.submitOnce).not.toHaveBeenCalled();
    expect(unlinked.submitOnce).not.toHaveBeenCalled();
  });
});
