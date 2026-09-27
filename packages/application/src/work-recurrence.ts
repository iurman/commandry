import type {
  CreateWorkRecurrenceRequest,
  UpdateWorkRecurrenceRequest,
  WorkRecurrenceAuditEvent,
  WorkRecurrenceDefinition,
  WorkRecurrenceJobV1,
  WorkRecurrenceOccurrence,
} from "@commandry/contracts";

export type WorkRecurrencePage<T> = {
  items: T[];
  nextCursor: string | null;
};
export type WorkRecurrencePageQuery = {
  limit: number;
  cursor?: string | undefined;
};

export interface WorkRecurrencePort {
  getDefinitionByWorkItemId(
    workItemId: string,
  ): Promise<WorkRecurrenceDefinition | null>;
  getDefinitionById(id: string): Promise<WorkRecurrenceDefinition | null>;
  createDefinition(
    workItemId: string,
    input: CreateWorkRecurrenceRequest,
  ): Promise<WorkRecurrenceDefinition>;
  updateDefinition(
    workItemId: string,
    input: UpdateWorkRecurrenceRequest,
  ): Promise<WorkRecurrenceDefinition>;
  listOccurrences(
    workItemId: string,
    query: WorkRecurrencePageQuery,
  ): Promise<WorkRecurrencePage<WorkRecurrenceOccurrence>>;
  getOccurrenceById(id: string): Promise<WorkRecurrenceOccurrence | null>;
  listAudit(
    workItemId: string,
    query: WorkRecurrencePageQuery,
  ): Promise<WorkRecurrencePage<WorkRecurrenceAuditEvent>>;
  beginOccurrence(
    occurrenceId: string,
    definitionId: string,
  ): Promise<WorkRecurrenceOccurrence>;
  finishOccurrence(
    occurrenceId: string,
    definitionId: string,
  ): Promise<WorkRecurrenceOccurrence>;
  failOccurrence(
    occurrenceId: string,
    definitionId: string,
    reason: string,
  ): Promise<void>;
}

export function createWorkRecurrenceService(port: WorkRecurrencePort) {
  return {
    getDefinitionByWorkItemId: port.getDefinitionByWorkItemId,
    getDefinitionById: port.getDefinitionById,
    createDefinition: port.createDefinition,
    updateDefinition: port.updateDefinition,
    listOccurrences: port.listOccurrences,
    getOccurrenceById: port.getOccurrenceById,
    listAudit: port.listAudit,
  };
}

export function createWorkRecurrenceProcessor(port: WorkRecurrencePort) {
  return async (job: WorkRecurrenceJobV1) => {
    const current = await port.beginOccurrence(
      job.occurrenceId,
      job.definitionId,
    );
    if (current.state === "generated") return current;
    try {
      return await port.finishOccurrence(job.occurrenceId, job.definitionId);
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown";
      await port.failOccurrence(job.occurrenceId, job.definitionId, reason);
      throw error;
    }
  };
}
