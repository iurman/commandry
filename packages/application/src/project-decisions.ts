import type {
  CreateProjectDecisionRequest,
  ProjectDecision,
  ProjectDecisionRevision,
  ReviseProjectDecisionRequest,
} from "@commandry/contracts";

export interface ProjectDecisionPort {
  create(
    projectId: string,
    input: CreateProjectDecisionRequest,
  ): Promise<ProjectDecision>;
  get(id: string): Promise<ProjectDecision | null>;
  list(
    projectId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: ProjectDecision[]; nextCursor: string | null }>;
  revise(
    id: string,
    input: ReviseProjectDecisionRequest,
  ): Promise<ProjectDecision>;
  listRevisions(
    id: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: ProjectDecisionRevision[]; nextCursor: string | null }>;
}

export function createProjectDecisionService(port: ProjectDecisionPort) {
  return {
    create: port.create,
    get: port.get,
    list: port.list,
    revise: port.revise,
    listRevisions: port.listRevisions,
  };
}
