import type {
  ChangeWorkAssignmentRequest,
  LocalAgentProfile,
  WorkItem,
  WorkItemAssignmentEvent,
} from "@commandry/contracts";

export type WorkAssignmentPage<T> = {
  items: T[];
  nextCursor: string | null;
};
export type WorkAssignmentPageQuery = {
  limit: number;
  cursor?: string | undefined;
};

export interface WorkAssignmentPort {
  getAssignmentEventById(id: string): Promise<WorkItemAssignmentEvent | null>;
  changeAssignment(
    workItemId: string,
    input: ChangeWorkAssignmentRequest,
  ): Promise<WorkItem>;
  listAssignmentEvents(
    workItemId: string,
    query: WorkAssignmentPageQuery,
  ): Promise<WorkAssignmentPage<WorkItemAssignmentEvent>>;
  listEligibleAgents(
    projectId: string,
    query: WorkAssignmentPageQuery,
  ): Promise<WorkAssignmentPage<LocalAgentProfile>>;
}

export function createWorkAssignmentService(port: WorkAssignmentPort) {
  return {
    getAssignmentEventById: port.getAssignmentEventById,
    changeAssignment: port.changeAssignment,
    listAssignmentEvents: port.listAssignmentEvents,
    listEligibleAgents: port.listEligibleAgents,
  };
}
