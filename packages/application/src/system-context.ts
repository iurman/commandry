import type {
  ArchiveSystemRequest,
  CreateSystemRequest,
  SetSystemDomainRequest,
  SystemAuditEvent,
  SystemDomainLink,
  SystemDomainMembership,
  SystemProjectConnection,
  SystemProjectLink,
  SystemResourceConnection,
  SystemResourceLink,
  SystemSummary,
  UpdateSystemRequest,
} from "@commandry/contracts";
import { SystemContextError } from "@commandry/domain";

type Page<T> = { items: T[]; nextCursor: string | null };
type PageQuery = { limit: number; cursor?: string | undefined };

export interface SystemContextPort {
  createSystem(
    input: CreateSystemRequest & { id: string },
  ): Promise<SystemSummary>;
  getSystem(id: string): Promise<SystemSummary | null>;
  listSystems(
    query: PageQuery & { lifecycle?: "active" | "archived" | undefined },
  ): Promise<Page<SystemSummary>>;
  updateSystem(id: string, input: UpdateSystemRequest): Promise<SystemSummary>;
  archiveSystem(id: string, expectedVersion: number): Promise<SystemSummary>;
  getSystemDomain(systemId: string): Promise<SystemDomainMembership | null>;
  setSystemDomain(
    systemId: string,
    input: SetSystemDomainRequest,
  ): Promise<SystemDomainMembership | null>;
  listDomainSystems(
    domainId: string,
    query: PageQuery,
  ): Promise<Page<SystemSummary>>;
  getSystemDomainLink(id: string): Promise<SystemDomainLink | null>;
  listSystemProjects(
    systemId: string,
    query: PageQuery,
  ): Promise<Page<SystemProjectConnection>>;
  listProjectSystems(
    projectId: string,
    query: PageQuery,
  ): Promise<Page<SystemProjectConnection>>;
  linkSystemProject(
    systemId: string,
    projectId: string,
  ): Promise<SystemProjectConnection>;
  archiveSystemProjectLink(id: string): Promise<SystemProjectLink>;
  getSystemProjectLink(id: string): Promise<SystemProjectLink | null>;
  listSystemResources(
    systemId: string,
    query: PageQuery,
  ): Promise<Page<SystemResourceConnection>>;
  listResourceSystems(
    resourceId: string,
    query: PageQuery,
  ): Promise<Page<SystemResourceConnection>>;
  linkSystemResource(
    systemId: string,
    resourceId: string,
  ): Promise<SystemResourceConnection>;
  archiveSystemResourceLink(id: string): Promise<SystemResourceLink>;
  getSystemResourceLink(id: string): Promise<SystemResourceLink | null>;
  listSystemAudit(
    systemId: string,
    query: PageQuery,
  ): Promise<Page<SystemAuditEvent>>;
}

export function createSystemContextService(port: SystemContextPort) {
  async function requireSystem(id: string) {
    if (!(await port.getSystem(id)))
      throw new SystemContextError("SYSTEM_NOT_FOUND", "System not found");
  }
  return {
    createSystem(input: CreateSystemRequest) {
      return port.createSystem({ ...input, id: crypto.randomUUID() });
    },
    getSystem: port.getSystem,
    listSystems: port.listSystems,
    updateSystem: port.updateSystem,
    archiveSystem(id: string, input: ArchiveSystemRequest) {
      return port.archiveSystem(id, input.expectedVersion);
    },
    async getSystemDomain(systemId: string) {
      await requireSystem(systemId);
      return port.getSystemDomain(systemId);
    },
    setSystemDomain: port.setSystemDomain,
    listDomainSystems: port.listDomainSystems,
    getSystemDomainLink: port.getSystemDomainLink,
    async listSystemProjects(systemId: string, query: PageQuery) {
      await requireSystem(systemId);
      return port.listSystemProjects(systemId, query);
    },
    listProjectSystems: port.listProjectSystems,
    linkSystemProject: port.linkSystemProject,
    archiveSystemProjectLink: port.archiveSystemProjectLink,
    getSystemProjectLink: port.getSystemProjectLink,
    async listSystemResources(systemId: string, query: PageQuery) {
      await requireSystem(systemId);
      return port.listSystemResources(systemId, query);
    },
    listResourceSystems: port.listResourceSystems,
    linkSystemResource: port.linkSystemResource,
    archiveSystemResourceLink: port.archiveSystemResourceLink,
    getSystemResourceLink: port.getSystemResourceLink,
    async listSystemAudit(systemId: string, query: PageQuery) {
      await requireSystem(systemId);
      return port.listSystemAudit(systemId, query);
    },
  };
}
