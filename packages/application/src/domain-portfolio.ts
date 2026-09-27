import type {
  ArchiveDomainRequest,
  CreateDomainRequest,
  DomainAuditEvent,
  DomainSummary,
  ProjectDomainLink,
  ProjectDomainMembership,
  ProjectSummary,
  SetProjectDomainRequest,
  UpdateDomainRequest,
} from "@commandry/contracts";
import { DomainPortfolioError } from "@commandry/domain";

type Page<T> = { items: T[]; nextCursor: string | null };
type PageQuery = { limit: number; cursor?: string | undefined };

export interface DomainPortfolioPort {
  createDomain(
    input: CreateDomainRequest & { id: string },
  ): Promise<DomainSummary>;
  getDomain(id: string): Promise<DomainSummary | null>;
  hasProject(id: string): Promise<boolean>;
  listDomains(
    input: PageQuery & { lifecycle?: "active" | "archived" | undefined },
  ): Promise<Page<DomainSummary>>;
  updateDomain(id: string, input: UpdateDomainRequest): Promise<DomainSummary>;
  archiveDomain(id: string, expectedVersion: number): Promise<DomainSummary>;
  getProjectDomain(projectId: string): Promise<ProjectDomainMembership | null>;
  setProjectDomain(
    projectId: string,
    input: SetProjectDomainRequest,
  ): Promise<ProjectDomainMembership | null>;
  getProjectDomainLink(id: string): Promise<ProjectDomainLink | null>;
  listDomainProjects(
    domainId: string,
    query: PageQuery,
  ): Promise<Page<ProjectSummary>>;
  listDomainAudit(
    domainId: string,
    query: PageQuery,
  ): Promise<Page<DomainAuditEvent>>;
}

export function createDomainPortfolioService(port: DomainPortfolioPort) {
  async function requireDomain(id: string) {
    if (!(await port.getDomain(id)))
      throw new DomainPortfolioError("DOMAIN_NOT_FOUND", "Domain not found");
  }
  return {
    createDomain(input: CreateDomainRequest) {
      return port.createDomain({ ...input, id: crypto.randomUUID() });
    },
    getDomain: port.getDomain,
    listDomains: port.listDomains,
    updateDomain: port.updateDomain,
    archiveDomain(id: string, input: ArchiveDomainRequest) {
      return port.archiveDomain(id, input.expectedVersion);
    },
    async getProjectDomain(projectId: string) {
      if (!(await port.hasProject(projectId)))
        throw new DomainPortfolioError(
          "PROJECT_NOT_FOUND",
          "Project not found",
        );
      return port.getProjectDomain(projectId);
    },
    setProjectDomain: port.setProjectDomain,
    getProjectDomainLink: port.getProjectDomainLink,
    async listDomainProjects(domainId: string, query: PageQuery) {
      await requireDomain(domainId);
      return port.listDomainProjects(domainId, query);
    },
    async listDomainAudit(domainId: string, query: PageQuery) {
      await requireDomain(domainId);
      return port.listDomainAudit(domainId, query);
    },
  };
}
