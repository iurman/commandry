import type {
  LocalConnectorFeedItem,
  LocalConnectorToken,
  LocalIntegration,
  RunLocalIntegrationSampleRequest,
  SyntheticEventImportRecord,
} from "@commandry/contracts";
import {
  LocalIntegrationError,
  requireLocalIntegrationScenario,
} from "@commandry/domain";

export interface LocalConnectorPort {
  get(id: string): Promise<LocalIntegration | null>;
  resourceLinkedToProject(
    resourceId: string,
    projectId: string,
  ): Promise<boolean>;
  submitSample(
    id: string,
    input: RunLocalIntegrationSampleRequest,
    ingressMode: "local-receiver" | "local-poll-feed",
  ): Promise<SyntheticEventImportRecord>;
  rotateToken(id: string): Promise<LocalConnectorToken>;
  verifyToken(id: string, token: string): Promise<boolean>;
  enqueue(
    id: string,
    input: RunLocalIntegrationSampleRequest,
  ): Promise<LocalConnectorFeedItem>;
  list(
    id: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: LocalConnectorFeedItem[]; nextCursor: string | null }>;
  claimNext(): Promise<LocalConnectorFeedItem | null>;
  complete(id: string, importId: string): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}

export function createLocalConnectorService(port: LocalConnectorPort) {
  async function requireBoundSource(
    id: string,
    input?: RunLocalIntegrationSampleRequest,
  ) {
    const instance = await port.get(id);
    if (!instance)
      throw new LocalIntegrationError(
        "INTEGRATION_NOT_FOUND",
        "Integration not found",
      );
    if (!instance.enabled)
      throw new LocalIntegrationError(
        "INTEGRATION_DISABLED",
        "Enable this local source first",
      );
    if (input) requireLocalIntegrationScenario(instance.kind, input.scenarioId);
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
    return instance;
  }
  return {
    async rotateToken(id: string) {
      await requireBoundSource(id);
      return port.rotateToken(id);
    },
    async receive(
      id: string,
      token: string,
      input: RunLocalIntegrationSampleRequest,
    ) {
      if (!(await port.verifyToken(id, token))) return null;
      await requireBoundSource(id, input);
      return port.submitSample(id, input, "local-receiver");
    },
    async enqueue(id: string, input: RunLocalIntegrationSampleRequest) {
      await requireBoundSource(id, input);
      return port.enqueue(id, input);
    },
    async list(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      if (!(await port.get(id)))
        throw new LocalIntegrationError(
          "INTEGRATION_NOT_FOUND",
          "Integration not found",
        );
      return port.list(id, query);
    },
    async processNext() {
      const item = await port.claimNext();
      if (!item) return null;
      try {
        const receipt = await port.submitSample(
          item.integrationInstanceId,
          {
            scenarioId: item.scenarioId,
            occurrenceId: item.occurrenceId,
            ...(item.occurredAt ? { occurredAt: item.occurredAt } : {}),
          },
          "local-poll-feed",
        );
        await port.complete(item.id, receipt.id);
        return { ...item, state: "submitted" as const, importId: receipt.id };
      } catch (error) {
        const visibleError =
          error instanceof LocalIntegrationError
            ? error.message
            : "Local poll submission failed";
        await port.fail(item.id, visibleError);
        return { ...item, state: "failed" as const };
      }
    },
  };
}
