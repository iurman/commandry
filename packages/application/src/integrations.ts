import type {
  CreateLocalIntegrationRequest,
  LocalIntegration,
  RunLocalIntegrationSampleRequest,
  SyntheticEventImportRecord,
} from "@commandry/contracts";
import {
  LocalIntegrationError,
  requireLocalIntegrationScenario,
} from "@commandry/domain";
import {
  prepareSyntheticEventImport,
  type PreparedSyntheticEventImport,
} from "./synthetic-events";

export interface LocalIntegrationPort {
  create(input: CreateLocalIntegrationRequest): Promise<LocalIntegration>;
  get(id: string): Promise<LocalIntegration | null>;
  list(input: {
    limit: number;
    cursor?: string | undefined;
    projectId?: string | undefined;
  }): Promise<{ items: LocalIntegration[]; nextCursor: string | null }>;
  setEnabled(id: string, enabled: boolean): Promise<LocalIntegration>;
  resourceLinkedToProject(
    resourceId: string,
    projectId: string,
  ): Promise<boolean>;
  submitOnce(
    input: PreparedSyntheticEventImport,
  ): Promise<SyntheticEventImportRecord>;
}

export function createLocalIntegrationService(port: LocalIntegrationPort) {
  return {
    create(input: CreateLocalIntegrationRequest) {
      return port.create(input);
    },
    get(id: string) {
      return port.get(id);
    },
    list(input: {
      limit: number;
      cursor?: string | undefined;
      projectId?: string | undefined;
    }) {
      return port.list(input);
    },
    setEnabled(id: string, enabled: boolean) {
      return port.setEnabled(id, enabled);
    },
    async submitSample(
      id: string,
      input: RunLocalIntegrationSampleRequest,
      ingressMode: "manual" | "local-receiver" | "local-poll-feed" = "manual",
    ) {
      const instance = await port.get(id);
      if (!instance) {
        throw new LocalIntegrationError(
          "INTEGRATION_NOT_FOUND",
          "Integration not found",
        );
      }
      if (!instance.enabled) {
        throw new LocalIntegrationError(
          "INTEGRATION_DISABLED",
          "Enable the integration before running a sample",
        );
      }
      requireLocalIntegrationScenario(instance.kind, input.scenarioId);
      if (
        instance.resourceId &&
        !(await port.resourceLinkedToProject(
          instance.resourceId,
          instance.projectId,
        ))
      ) {
        throw new LocalIntegrationError(
          "RESOURCE_NOT_LINKED",
          "Resource is no longer linked to this project",
        );
      }
      return port.submitOnce(
        prepareSyntheticEventImport(
          {
            scenarioId: input.scenarioId,
            projectId: instance.projectId,
            ...(instance.resourceId ? { resourceId: instance.resourceId } : {}),
            occurrenceId: input.occurrenceId,
            ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
          },
          instance.id,
          ingressMode,
        ),
      );
    },
  };
}
