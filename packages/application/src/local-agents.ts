import {
  localAgentProfileSchema,
  localAgentProjectAssignmentSchema,
  type CreateLocalAgentRequest,
  type LocalAgentProfile,
  type LocalAgentProjectAssignment,
} from "@commandry/contracts";
import { LocalAgentError } from "@commandry/domain";

export type LocalAgentPage<T> = { items: T[]; nextCursor: string | null };
export type LocalAgentPageQuery = {
  limit: number;
  cursor?: string | undefined;
};

export interface LocalAgentRepository {
  create(input: CreateLocalAgentRequest): Promise<LocalAgentProfile>;
  getById(id: string): Promise<LocalAgentProfile | null>;
  list(query: LocalAgentPageQuery): Promise<LocalAgentPage<LocalAgentProfile>>;
  projectExists(projectId: string): Promise<boolean>;
  assignProject(
    agentId: string,
    projectId: string,
  ): Promise<LocalAgentProjectAssignment>;
  listProjects(
    agentId: string,
    query: LocalAgentPageQuery,
  ): Promise<LocalAgentPage<LocalAgentProjectAssignment>>;
  isAssigned(agentId: string, projectId: string): Promise<boolean>;
}

export function createLocalAgentService(repository: LocalAgentRepository) {
  return {
    async create(input: CreateLocalAgentRequest): Promise<LocalAgentProfile> {
      return localAgentProfileSchema.parse(await repository.create(input));
    },
    async getById(id: string): Promise<LocalAgentProfile | null> {
      const agent = await repository.getById(id);
      return agent ? localAgentProfileSchema.parse(agent) : null;
    },
    async list(
      query: LocalAgentPageQuery,
    ): Promise<LocalAgentPage<LocalAgentProfile>> {
      const page = await repository.list(query);
      return {
        items: page.items.map((item) => localAgentProfileSchema.parse(item)),
        nextCursor: page.nextCursor,
      };
    },
    async assignProject(
      agentId: string,
      input: { projectId: string },
    ): Promise<LocalAgentProjectAssignment> {
      if (!(await repository.getById(agentId))) {
        throw new LocalAgentError("AGENT_NOT_FOUND", "Local agent not found");
      }
      if (!(await repository.projectExists(input.projectId))) {
        throw new LocalAgentError("PROJECT_NOT_FOUND", "Project not found");
      }
      if (await repository.isAssigned(agentId, input.projectId)) {
        throw new LocalAgentError(
          "ASSIGNMENT_EXISTS",
          "Agent is already assigned to this project",
        );
      }
      return localAgentProjectAssignmentSchema.parse(
        await repository.assignProject(agentId, input.projectId),
      );
    },
    async listProjects(
      agentId: string,
      query: LocalAgentPageQuery,
    ): Promise<LocalAgentPage<LocalAgentProjectAssignment>> {
      if (!(await repository.getById(agentId))) {
        throw new LocalAgentError("AGENT_NOT_FOUND", "Local agent not found");
      }
      const page = await repository.listProjects(agentId, query);
      return {
        items: page.items.map((item) =>
          localAgentProjectAssignmentSchema.parse(item),
        ),
        nextCursor: page.nextCursor,
      };
    },
  };
}
