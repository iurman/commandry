import type {
  WorkItemAcceptance,
  WorkItemAcceptanceRevision,
  WorkItemVerification,
} from "@commandry/contracts";

export type WorkAcceptancePage<T> = {
  items: T[];
  nextCursor: string | null;
};

export interface WorkAcceptancePort {
  get(workItemId: string): Promise<WorkItemAcceptance>;
  save(
    workItemId: string,
    input: { expectedVersion: number; criteria: string },
  ): Promise<WorkItemAcceptance>;
  listRevisions(
    workItemId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<WorkAcceptancePage<WorkItemAcceptanceRevision>>;
  getRevision(id: string): Promise<WorkItemAcceptanceRevision | null>;
  recordVerification(
    workItemId: string,
    input: {
      expectedAcceptanceVersion: number;
      attachmentId: string;
      result: "met" | "not_met";
      note: string;
    },
  ): Promise<WorkItemVerification>;
  listVerifications(
    workItemId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<WorkAcceptancePage<WorkItemVerification>>;
  getVerification(id: string): Promise<WorkItemVerification | null>;
}

export function createWorkAcceptanceService(port: WorkAcceptancePort) {
  return {
    get: port.get,
    save: port.save,
    listRevisions: port.listRevisions,
    getRevision: port.getRevision,
    recordVerification: port.recordVerification,
    listVerifications: port.listVerifications,
    getVerification: port.getVerification,
  };
}
