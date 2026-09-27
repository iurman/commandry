import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  captureSchema,
  captureFileMetadataSchema,
  captureTriageSuggestionSchema,
  captureTriageDecisionSchema,
  captureTriageReviewSchema,
  reviewCaptureTriageRequestSchema,
  reviewCaptureTriageResponseSchema,
  captureTriageJobV1Schema,
  changeWorkItemStatusRequestSchema,
  changeWorkItemPlanningRequestSchema,
  changeWorkAssignmentRequestSchema,
  workItemAssignmentEventSchema,
  listWorkAssignmentEventsResponseSchema,
  listProjectEligibleAgentsResponseSchema,
  createWorkRecurrenceRequestSchema,
  updateWorkRecurrenceRequestSchema,
  workRecurrenceDefinitionSchema,
  getWorkRecurrenceResponseSchema,
  workRecurrenceOccurrenceSchema,
  listWorkRecurrenceOccurrencesResponseSchema,
  workRecurrenceAuditEventSchema,
  listWorkRecurrenceAuditResponseSchema,
  workRecurrenceJobV1Schema,
  workItemPlanningEventSchema,
  listWorkItemPlanningEventsResponseSchema,
  listUpcomingWorkResponseSchema,
  listWorkspaceWorkResponseSchema,
  workspaceWorkItemSchema,
  listWorkspaceKnowledgeResponseSchema,
  workspaceKnowledgeItemSchema,
  listWorkspaceDecisionsResponseSchema,
  workspaceDecisionSchema,
  workItemStatusEventSchema,
  listWorkItemStatusEventsResponseSchema,
  createWorkItemCommentRequestSchema,
  workItemCommentSchema,
  listWorkItemCommentsResponseSchema,
  createWorkItemRelationRequestSchema,
  workItemRelationSchema,
  listWorkItemRelationsResponseSchema,
  createWorkItemAttachmentRequestSchema,
  workItemAttachmentSchema,
  listWorkItemAttachmentsResponseSchema,
  workItemAcceptanceSchema,
  saveWorkItemAcceptanceRequestSchema,
  workItemAcceptanceRevisionSchema,
  listWorkItemAcceptanceRevisionsResponseSchema,
  createWorkItemVerificationRequestSchema,
  workItemVerificationSchema,
  listWorkItemVerificationsResponseSchema,
  createLocalAgentRequestSchema,
  localAgentProfileSchema,
  listLocalAgentsResponseSchema,
  createLocalAgentProjectAssignmentRequestSchema,
  localAgentProjectAssignmentSchema,
  listLocalAgentProjectAssignmentsResponseSchema,
  createLocalAgentRunRequestSchema,
  createOvernightQueueEntryRequestSchema,
  overnightQueueEntrySchema,
  listOvernightQueueResponseSchema,
  overnightReadinessSchema,
  overnightQueueJobV1Schema,
  overnightQueueAuditEventSchema,
  listOvernightQueueAuditResponseSchema,
  createLocalMcpSessionRequestSchema,
  createdLocalMcpSessionSchema,
  localMcpSessionSchema,
  listLocalMcpSessionsResponseSchema,
  localMcpReadRequestSchema,
  localMcpReadResponseSchema,
  localMcpAuditEventSchema,
  listLocalMcpAuditResponseSchema,
  localAgentRunJobV1Schema,
  localAgentRunGrantSchema,
  localAgentRunAttemptSchema,
  fakeLocalAgentRunResultSchema,
  localAgentRunSchema,
  agentContextReadRequestSchema,
  agentContextReadSourceSchema,
  agentContextReadResponseSchema,
  agentRunAuditEventSchema,
  listAgentRunAuditResponseSchema,
  createSimulatedActionRequestSchema,
  simulatedApprovalAutomaticCeilingSchema,
  simulatedApprovalDescriptorSchema,
  simulatedApprovalStateSchema,
  simulatedApprovalDecisionRequestSchema,
  simulatedApprovalDecisionSchema,
  simulatedApprovalOutcomeSchema,
  simulatedApprovalSchema,
  listSimulatedApprovalsResponseSchema,
  simulatedApprovalAuditEventSchema,
  listSimulatedApprovalAuditResponseSchema,
  simulatedApprovalJobV1Schema,
  createExecutionPacketRequestSchema,
  createSyntheticEventImportRequestSchema,
  createLocalIntegrationRequestSchema,
  setLocalIntegrationEnabledRequestSchema,
  runLocalIntegrationSampleRequestSchema,
  localIntegrationSchema,
  listLocalIntegrationsResponseSchema,
  createCaptureRequestSchema,
  createProjectRequestSchema,
  createDomainRequestSchema,
  updateDomainRequestSchema,
  archiveDomainRequestSchema,
  setProjectDomainRequestSchema,
  domainSummarySchema,
  domainAuditEventSchema,
  projectDomainLinkSchema,
  projectDomainResponseSchema,
  listDomainsResponseSchema,
  listDomainProjectsResponseSchema,
  listDomainAuditResponseSchema,
  createSystemRequestSchema,
  updateSystemRequestSchema,
  archiveSystemRequestSchema,
  setSystemDomainRequestSchema,
  linkSystemProjectRequestSchema,
  linkSystemResourceRequestSchema,
  systemSummarySchema,
  systemAuditEventSchema,
  systemDomainLinkSchema,
  systemProjectLinkSchema,
  systemResourceLinkSchema,
  systemDomainResponseSchema,
  systemProjectConnectionSchema,
  systemResourceConnectionSchema,
  listSystemsResponseSchema,
  listDomainSystemsResponseSchema,
  listSystemProjectsResponseSchema,
  listSystemResourcesResponseSchema,
  listSystemAuditResponseSchema,
  createProjectResourceLinkRequestSchema,
  createResourceRequestSchema,
  setResourceParentRequestSchema,
  createResourceDependencyRequestSchema,
  resourceDependencySchema,
  listResourceDependenciesResponseSchema,
  createSyntheticRunRequestSchema,
  correlationMetadataSchema,
  errorResponseSchema,
  evidenceReferenceSchema,
  briefFactSchema,
  briefSectionSchema,
  briefInferenceSchema,
  notRecordedSchema,
  projectBriefSchema,
  executionPacketSnapshotSchema,
  executionPacketSchema,
  listExecutionPacketsResponseSchema,
  fileCaptureRequestSchema,
  fileCaptureResponseSchema,
  healthResponseSchema,
  knowledgeItemSchema,
  createKnowledgeProjectLinkRequestSchema,
  knowledgeProjectLinkSchema,
  knowledgeProjectConnectionSchema,
  listKnowledgeProjectConnectionsResponseSchema,
  knowledgeProjectAuditEventSchema,
  listKnowledgeProjectAuditResponseSchema,
  createWorkProjectLinkRequestSchema,
  workProjectLinkSchema,
  workProjectConnectionSchema,
  listWorkProjectConnectionsResponseSchema,
  workProjectAuditEventSchema,
  listWorkProjectAuditResponseSchema,
  reviseKnowledgeItemRequestSchema,
  knowledgeItemRevisionSchema,
  listKnowledgeItemRevisionsResponseSchema,
  createProjectDecisionRequestSchema,
  reviseProjectDecisionRequestSchema,
  projectDecisionSchema,
  projectDecisionRevisionSchema,
  listProjectDecisionsResponseSchema,
  listProjectDecisionRevisionsResponseSchema,
  createAutomationDefinitionRequestSchema,
  setAutomationEnabledRequestSchema,
  triggerAutomationRunRequestSchema,
  automationDefinitionSchema,
  automationRunResultSchema,
  automationRunSchema,
  automationRunAttemptSchema,
  automationAuditEventSchema,
  automationJobV1Schema,
  morningDigestItemSchema,
  morningDigestResponseSchema,
  listAutomationDefinitionsResponseSchema,
  listAutomationRunsResponseSchema,
  listAutomationRunAttemptsResponseSchema,
  listAutomationAuditResponseSchema,
  notificationSchema,
  listNotificationsResponseSchema,
  changeNotificationStateRequestSchema,
  notificationAuditEventSchema,
  listNotificationAuditResponseSchema,
  attentionItemSchema,
  listAttentionResponseSchema,
  listNormalizedEventsResponseSchema,
  listSyntheticAlertsResponseSchema,
  listSyntheticEventImportsResponseSchema,
  listCapturesResponseSchema,
  listKnowledgeItemsResponseSchema,
  listProjectResourceLinksResponseSchema,
  listProjectsResponseSchema,
  listResourcesResponseSchema,
  listWorkItemsResponseSchema,
  normalizedEventSchema,
  syntheticMetricSampleSchema,
  listSyntheticMetricsResponseSchema,
  projectResourceLinkSchema,
  projectResourceLinkDetailSchema,
  projectSummarySchema,
  resourceSummarySchema,
  searchResponseSchema,
  searchResultSchema,
  syntheticJobV1Schema,
  sourceEnvelopeSchema,
  syntheticAlertSchema,
  syntheticEventImportJobV1Schema,
  syntheticEventImportSchema,
  syntheticRunSchema,
  versionResponseSchema,
  workItemSchema,
} from "./index";

function component(schema: z.ZodType): Record<string, unknown> {
  const definition: Record<string, unknown> = z.toJSONSchema(schema);
  delete definition.$schema;
  return definition;
}

function jsonContent(schema: string) {
  return {
    "application/json": { schema: { $ref: `#/components/schemas/${schema}` } },
  };
}

const idParameter = {
  in: "path",
  name: "id",
  required: true,
  schema: { type: "string", format: "uuid" },
};

const pageParameters = [
  {
    in: "query",
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
  {
    in: "query",
    name: "cursor",
    required: false,
    schema: { type: "string", format: "uuid" },
  },
];

function systemResponses(
  status: "200" | "201",
  schema: string,
  description: string,
) {
  return {
    [status]: { description, content: jsonContent(schema) },
    "400": {
      description: "Invalid identifier, query, or body",
      content: jsonContent("ErrorResponse"),
    },
    "404": {
      description: "System, related record, or link not found",
      content: jsonContent("ErrorResponse"),
    },
    "409": {
      description: "Stale, archived, or still-linked record",
      content: jsonContent("ErrorResponse"),
    },
    "503": {
      description: "Database unavailable",
      content: jsonContent("ErrorResponse"),
    },
  };
}

function systemRead(operationId: string, schema: string, description: string) {
  return {
    get: {
      operationId,
      parameters: [idParameter],
      responses: systemResponses("200", schema, description),
    },
  };
}

function systemPage(operationId: string, schema: string, description: string) {
  return {
    get: {
      operationId,
      parameters: [idParameter, ...pageParameters],
      responses: systemResponses("200", schema, description),
    },
  };
}

const systemPaths = {
  "/api/v1/systems": {
    get: {
      operationId: "listSystems",
      parameters: [
        ...pageParameters,
        {
          in: "query",
          name: "lifecycle",
          required: false,
          schema: { type: "string", enum: ["active", "archived"] },
        },
      ],
      responses: systemResponses("200", "ListSystemsResponse", "System page"),
    },
    post: {
      operationId: "createSystem",
      requestBody: {
        required: true,
        content: jsonContent("CreateSystemRequest"),
      },
      responses: systemResponses("201", "SystemSummary", "Created system"),
    },
  },
  "/api/v1/systems/{id}": {
    ...systemRead("getSystem", "SystemSummary", "System record"),
    patch: {
      operationId: "updateSystem",
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: jsonContent("UpdateSystemRequest"),
      },
      responses: systemResponses("200", "SystemSummary", "Updated system"),
    },
  },
  "/api/v1/systems/{id}/archive": {
    put: {
      operationId: "archiveSystem",
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: jsonContent("ArchiveSystemRequest"),
      },
      responses: systemResponses(
        "200",
        "SystemSummary",
        "Archived empty system",
      ),
    },
  },
  "/api/v1/systems/{id}/domain": {
    ...systemRead(
      "getSystemDomain",
      "SystemDomainResponse",
      "Current owning domain or null",
    ),
    put: {
      operationId: "setSystemDomain",
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: jsonContent("SetSystemDomainRequest"),
      },
      responses: systemResponses(
        "200",
        "SystemDomainResponse",
        "Current owning domain or null",
      ),
    },
  },
  "/api/v1/systems/{id}/projects": {
    ...systemPage(
      "listSystemProjects",
      "ListSystemProjectsResponse",
      "Related project page",
    ),
    post: {
      operationId: "linkSystemProject",
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: jsonContent("LinkSystemProjectRequest"),
      },
      responses: systemResponses(
        "200",
        "SystemProjectConnection",
        "Current typed system-project relationship",
      ),
    },
  },
  "/api/v1/systems/{id}/resources": {
    ...systemPage(
      "listSystemResources",
      "ListSystemResourcesResponse",
      "Supporting resource page",
    ),
    post: {
      operationId: "linkSystemResource",
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: jsonContent("LinkSystemResourceRequest"),
      },
      responses: systemResponses(
        "200",
        "SystemResourceConnection",
        "Current typed resource-system relationship",
      ),
    },
  },
  "/api/v1/systems/{id}/audit": systemPage(
    "listSystemAudit",
    "ListSystemAuditResponse",
    "Immutable system audit page",
  ),
  "/api/v1/domains/{id}/systems": systemPage(
    "listDomainSystems",
    "ListDomainSystemsResponse",
    "Systems owned by this domain",
  ),
  "/api/v1/projects/{id}/systems": systemPage(
    "listProjectSystems",
    "ListSystemProjectsResponse",
    "Systems related to this project",
  ),
  "/api/v1/resources/{id}/systems": systemPage(
    "listResourceSystems",
    "ListSystemResourcesResponse",
    "Systems supported by this resource",
  ),
  "/api/v1/system-domain-links/{id}": systemRead(
    "getSystemDomainLink",
    "SystemDomainLink",
    "Exact typed domain relationship, including archived history",
  ),
  "/api/v1/system-project-links/{id}": systemRead(
    "getSystemProjectLink",
    "SystemProjectLink",
    "Exact typed project relationship, including archived history",
  ),
  "/api/v1/system-project-links/{id}/archive": {
    put: {
      operationId: "archiveSystemProjectLink",
      parameters: [idParameter],
      responses: systemResponses(
        "200",
        "SystemProjectLink",
        "Archived system-project relationship",
      ),
    },
  },
  "/api/v1/system-resource-links/{id}": systemRead(
    "getSystemResourceLink",
    "SystemResourceLink",
    "Exact typed resource relationship, including archived history",
  ),
  "/api/v1/system-resource-links/{id}/archive": {
    put: {
      operationId: "archiveSystemResourceLink",
      parameters: [idParameter],
      responses: systemResponses(
        "200",
        "SystemResourceLink",
        "Archived resource-system relationship",
      ),
    },
  },
};

const knowledgeProjectPaths = {
  "/api/v1/knowledge-items/{id}/projects": {
    get: {
      operationId: "listKnowledgeItemProjects",
      summary: "Page active secondary project context for one Knowledge record",
      parameters: [idParameter, ...pageParameters],
      responses: {
        "200": {
          description: "Related project page",
          content: jsonContent("ListKnowledgeProjectConnectionsResponse"),
        },
        "404": {
          description: "Knowledge record not found",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
    post: {
      operationId: "linkKnowledgeItemProject",
      summary: "Relate one source-backed Knowledge record to another project",
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: jsonContent("CreateKnowledgeProjectLinkRequest"),
      },
      responses: {
        "200": {
          description: "Current typed relation",
          content: jsonContent("KnowledgeProjectConnection"),
        },
        "409": {
          description: "Target is already the primary project",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
  },
  "/api/v1/knowledge-items/{id}/project-audit": {
    get: {
      operationId: "listKnowledgeProjectAudit",
      summary: "Page immutable secondary project context decisions",
      parameters: [idParameter, ...pageParameters],
      responses: {
        "200": {
          description: "Audit event page",
          content: jsonContent("ListKnowledgeProjectAuditResponse"),
        },
      },
    },
  },
  "/api/v1/knowledge-project-links/{id}": {
    get: {
      operationId: "getKnowledgeProjectLink",
      summary: "Read an exact active or archived Knowledge project relation",
      parameters: [idParameter],
      responses: {
        "200": {
          description: "Exact relation",
          content: jsonContent("KnowledgeProjectLink"),
        },
        "404": {
          description: "Relation not found",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
  },
  "/api/v1/knowledge-project-links/{id}/archive": {
    put: {
      operationId: "archiveKnowledgeProjectLink",
      summary:
        "Archive one secondary project relation without deleting history",
      parameters: [idParameter],
      responses: {
        "200": {
          description: "Archived relation",
          content: jsonContent("KnowledgeProjectLink"),
        },
        "404": {
          description: "Relation not found",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
  },
};

const workProjectPaths = {
  "/api/v1/work-items/{id}/projects": {
    get: {
      operationId: "listWorkItemProjects",
      summary: "Page active secondary project context for one Work record",
      parameters: [idParameter, ...pageParameters],
      responses: {
        "200": {
          description: "Related project page",
          content: jsonContent("ListWorkProjectConnectionsResponse"),
        },
        "404": {
          description: "Work record not found",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
    post: {
      operationId: "linkWorkItemProject",
      summary: "Relate one source-backed Work record to another project",
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: jsonContent("CreateWorkProjectLinkRequest"),
      },
      responses: {
        "200": {
          description: "Current typed relation",
          content: jsonContent("WorkProjectConnection"),
        },
        "409": {
          description: "Target is already the primary project",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
  },
  "/api/v1/work-items/{id}/project-audit": {
    get: {
      operationId: "listWorkProjectAudit",
      summary: "Page immutable secondary project context decisions",
      parameters: [idParameter, ...pageParameters],
      responses: {
        "200": {
          description: "Audit event page",
          content: jsonContent("ListWorkProjectAuditResponse"),
        },
      },
    },
  },
  "/api/v1/work-project-links/{id}": {
    get: {
      operationId: "getWorkProjectLink",
      summary: "Read an exact active or archived Work project relation",
      parameters: [idParameter],
      responses: {
        "200": {
          description: "Exact relation",
          content: jsonContent("WorkProjectLink"),
        },
        "404": {
          description: "Relation not found",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
  },
  "/api/v1/work-project-links/{id}/archive": {
    put: {
      operationId: "archiveWorkProjectLink",
      summary:
        "Archive one secondary project relation without deleting history",
      parameters: [idParameter],
      responses: {
        "200": {
          description: "Archived relation",
          content: jsonContent("WorkProjectLink"),
        },
        "404": {
          description: "Relation not found",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
  },
};

const projectFilterParameter = {
  in: "query",
  name: "projectId",
  required: false,
  schema: { type: "string", format: "uuid" },
};

const resourceFilterParameter = {
  in: "query",
  name: "resourceId",
  required: false,
  schema: { type: "string", format: "uuid" },
};

export function generateOpenApi(): string {
  const document = {
    openapi: "3.1.0",
    info: { title: "Commandry API", version: "v1" },
    paths: {
      "/health/live": {
        get: {
          operationId: "getLiveness",
          responses: {
            "200": {
              description: "Process is healthy",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/health/ready": {
        get: {
          operationId: "getReadiness",
          responses: {
            "200": {
              description: "Dependencies are ready",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
            "503": {
              description: "A dependency is unavailable",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/version": {
        get: {
          operationId: "getVersion",
          responses: {
            "200": {
              description: "Release identity",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/VersionResponse" },
                },
              },
            },
          },
        },
      },
      "/api/v1/resources": {
        get: {
          operationId: "listResources",
          summary: "List resource summaries with cursor pagination",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "A page of resources",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ListResourcesResponse",
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: "createResource",
          summary: "Create a manually maintained resource",
          requestBody: {
            required: true,
            content: jsonContent("CreateResourceRequest"),
          },
          responses: {
            "201": {
              description: "Created resource with unknown observed health",
              content: jsonContent("ResourceSummary"),
            },
            "400": {
              description: "Invalid resource",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/resources/{id}": {
        get: {
          operationId: "getResource",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Resource summary",
              content: jsonContent("ResourceSummary"),
            },
            "404": {
              description: "Resource not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/resources/roots": {
        get: {
          operationId: "listRootResources",
          summary: "Page through resources with no primary parent",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "A page of root resources",
              content: jsonContent("ListResourcesResponse"),
            },
          },
        },
      },
      "/api/v1/resources/{id}/children": {
        get: {
          operationId: "listResourceChildren",
          summary: "Page through direct children in the primary hierarchy",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "A page of child resources",
              content: jsonContent("ListResourcesResponse"),
            },
            "404": {
              description: "Parent resource not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/resources/{id}/parent": {
        put: {
          operationId: "setResourceParent",
          summary: "Move a resource against its expected primary parent",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SetResourceParentRequest"),
          },
          responses: {
            "200": {
              description: "Resource with updated primary parent",
              content: jsonContent("ResourceSummary"),
            },
            "409": {
              description: "Stale parent or containment cycle",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/resources/{id}/dependencies": {
        get: {
          operationId: "listResourceDependencies",
          summary: "Page outgoing dependencies or incoming dependents",
          parameters: [
            idParameter,
            ...pageParameters,
            {
              in: "query",
              name: "direction",
              required: false,
              schema: {
                type: "string",
                enum: ["outgoing", "incoming"],
                default: "outgoing",
              },
            },
          ],
          responses: {
            "200": {
              description: "A page of typed resource relationships",
              content: jsonContent("ListResourceDependenciesResponse"),
            },
          },
        },
        post: {
          operationId: "addResourceDependency",
          summary: "Record a manual depends_on relationship",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateResourceDependencyRequest"),
          },
          responses: {
            "201": {
              description: "Typed dependency with inverse semantics",
              content: jsonContent("ResourceDependency"),
            },
            "409": {
              description: "Dependency already exists",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects": {
        get: {
          operationId: "listProjects",
          summary: "List projects with cursor pagination",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "A page of projects",
              content: jsonContent("ListProjectsResponse"),
            },
          },
        },
        post: {
          operationId: "createProject",
          requestBody: {
            required: true,
            content: jsonContent("CreateProjectRequest"),
          },
          responses: {
            "201": {
              description: "Created project",
              content: jsonContent("ProjectSummary"),
            },
            "400": {
              description: "Invalid project",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/domains": {
        get: {
          operationId: "listDomains",
          summary: "Page through locally owned portfolio domains",
          parameters: [
            ...pageParameters,
            {
              in: "query",
              name: "lifecycle",
              required: false,
              schema: { type: "string", enum: ["active", "archived"] },
            },
          ],
          responses: {
            "200": {
              description: "Domain page",
              content: jsonContent("ListDomainsResponse"),
            },
            "400": {
              description: "Invalid query",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        post: {
          operationId: "createDomain",
          requestBody: {
            required: true,
            content: jsonContent("CreateDomainRequest"),
          },
          responses: {
            "201": {
              description: "Created domain",
              content: jsonContent("DomainSummary"),
            },
            "400": {
              description: "Invalid domain",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/domains/{id}": {
        get: {
          operationId: "getDomain",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Domain record",
              content: jsonContent("DomainSummary"),
            },
            "404": {
              description: "Domain not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        patch: {
          operationId: "updateDomain",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("UpdateDomainRequest"),
          },
          responses: {
            "200": {
              description: "Updated domain",
              content: jsonContent("DomainSummary"),
            },
            "409": {
              description: "Stale or archived domain",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/domains/{id}/archive": {
        put: {
          operationId: "archiveDomain",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("ArchiveDomainRequest"),
          },
          responses: {
            "200": {
              description: "Archived empty domain",
              content: jsonContent("DomainSummary"),
            },
            "409": {
              description: "Domain has active projects or systems, or changed",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/domains/{id}/projects": {
        get: {
          operationId: "listDomainProjects",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Projects owned by this domain",
              content: jsonContent("ListDomainProjectsResponse"),
            },
            "404": {
              description: "Domain not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/domains/{id}/audit": {
        get: {
          operationId: "listDomainAudit",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Immutable local domain audit page",
              content: jsonContent("ListDomainAuditResponse"),
            },
            "404": {
              description: "Domain not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/domain": {
        get: {
          operationId: "getProjectDomain",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Current owning domain or null",
              content: jsonContent("ProjectDomainResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        put: {
          operationId: "setProjectDomain",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SetProjectDomainRequest"),
          },
          responses: {
            "200": {
              description: "Current owning domain or null",
              content: jsonContent("ProjectDomainResponse"),
            },
            "409": {
              description: "Stale membership or archived domain",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/project-domain-links/{id}": {
        get: {
          operationId: "getProjectDomainLink",
          parameters: [idParameter],
          responses: {
            "200": {
              description:
                "Exact typed relationship, including archived history",
              content: jsonContent("ProjectDomainLink"),
            },
            "404": {
              description: "Relationship not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      ...systemPaths,
      ...knowledgeProjectPaths,
      ...workProjectPaths,
      "/api/v1/projects/{id}": {
        get: {
          operationId: "getProject",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Project summary",
              content: jsonContent("ProjectSummary"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/brief": {
        get: {
          operationId: "getProjectBrief",
          summary:
            "Generate a deterministic evidence-linked project brief from one snapshot",
          parameters: [idParameter],
          responses: {
            "200": {
              description:
                "Bounded project brief with evidence and continuation links",
              content: jsonContent("ProjectBrief"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/resources": {
        get: {
          operationId: "listProjectResources",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "A page of typed resource relationships",
              content: jsonContent("ListProjectResourceLinksResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        post: {
          operationId: "linkProjectResource",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateProjectResourceLinkRequest"),
          },
          responses: {
            "201": {
              description: "Created typed resource relationship",
              content: jsonContent("ProjectResourceLink"),
            },
            "404": {
              description: "Project or resource not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Relationship already exists",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/project-resource-links/{id}": {
        get: {
          operationId: "getProjectResourceLink",
          summary: "Read one exact typed project-resource relationship",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Typed link identity and persisted timestamp",
              content: jsonContent("ProjectResourceLinkDetail"),
            },
            "404": {
              description: "Project-resource link not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/captures": {
        get: {
          operationId: "listCaptures",
          summary: "List original manual captures with cursor pagination",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "A page of captures",
              content: jsonContent("ListCapturesResponse"),
            },
          },
        },
        post: {
          operationId: "createCapture",
          summary: "Preserve original manual text or URL",
          requestBody: {
            required: true,
            content: jsonContent("CreateCaptureRequest"),
          },
          responses: {
            "201": {
              description: "Preserved manual capture",
              content: jsonContent("Capture"),
            },
            "400": {
              description: "Invalid capture",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/captures/files": {
        post: {
          operationId: "createFileCapture",
          summary: "Preserve a local original file of at most 2 MiB",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "string", format: "binary" } },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Original file captured with checksum",
              content: jsonContent("Capture"),
            },
            "413": {
              description: "File exceeds the local limit",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/captures/{id}/original-file": {
        get: {
          operationId: "downloadOriginalFile",
          summary: "Download verified original bytes as an attachment",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact original file bytes with SHA-256 header",
              content: {
                "application/octet-stream": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            "404": {
              description: "Original file not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/captures/{id}": {
        get: {
          operationId: "getCapture",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Original capture and filing reference",
              content: jsonContent("Capture"),
            },
            "404": {
              description: "Capture not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/captures/{id}/file": {
        post: {
          operationId: "fileCapture",
          summary: "Manually file a capture as project work or knowledge",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("FileCaptureRequest"),
          },
          responses: {
            "201": {
              description: "Capture and created record with provenance",
              content: jsonContent("FileCaptureResponse"),
            },
            "404": {
              description: "Capture or project not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Capture already filed",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/captures/{id}/triage": {
        get: {
          operationId: "getCaptureTriageReview",
          summary:
            "Read the local rule suggestion and separate review decision",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Suggestion and decision",
              content: jsonContent("CaptureTriageReview"),
            },
            "404": {
              description: "Capture not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        post: {
          operationId: "reviewCaptureTriage",
          summary: "Correct and approve, or reject, a local rule suggestion",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("ReviewCaptureTriageRequest"),
          },
          responses: {
            "200": {
              description: "Saved review and optional filed record",
              content: jsonContent("ReviewCaptureTriageResponse"),
            },
            "409": {
              description: "Suggestion missing or already reviewed",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/captures/{id}/triage-suggestion": {
        post: {
          operationId: "requestCaptureTriageSuggestion",
          summary: "Queue a replay-safe local rule suggestion",
          parameters: [idParameter],
          responses: {
            "202": { description: "Suggestion job queued" },
            "404": {
              description: "Capture not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}": {
        get: {
          operationId: "getWorkItem",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact work item and source capture reference",
              content: jsonContent("WorkItem"),
            },
            "404": {
              description: "Work item not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/planning": {
        put: {
          operationId: "changeWorkItemPlanning",
          summary:
            "Change optional task priority and date against a known revision",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("ChangeWorkItemPlanningRequest"),
          },
          responses: {
            "200": {
              description: "Updated task with preserved source reference",
              content: jsonContent("WorkItem"),
            },
            "409": {
              description: "Task planning changed concurrently or is unchanged",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/assignment": {
        put: {
          operationId: "changeWorkAssignment",
          summary:
            "Assign a task to the local user or a scoped synthetic agent",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("ChangeWorkAssignmentRequest"),
          },
          responses: {
            "200": {
              description: "Updated task with assignment and source reference",
              content: jsonContent("WorkItem"),
            },
            "409": {
              description: "Assignment changed or agent lacks project scope",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/assignment-events": {
        get: {
          operationId: "listWorkAssignmentEvents",
          summary: "Page through immutable assignment changes",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Assignment history page",
              content: jsonContent("ListWorkAssignmentEventsResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/recurrence": {
        get: {
          operationId: "getWorkRecurrence",
          summary:
            "Read the local recurring definition for one source Work item",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Definition or null when this task is not recurring",
              content: jsonContent("GetWorkRecurrenceResponse"),
            },
          },
        },
        post: {
          operationId: "createWorkRecurrence",
          summary: "Schedule local task occurrences from an original Work item",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateWorkRecurrenceRequest"),
          },
          responses: {
            "201": {
              description: "Created local recurring Work definition",
              content: jsonContent("WorkRecurrenceDefinition"),
            },
            "409": {
              description: "Recurring definition already exists",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        put: {
          operationId: "updateWorkRecurrence",
          summary: "Change cadence or pause/resume a local recurring task",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("UpdateWorkRecurrenceRequest"),
          },
          responses: {
            "200": {
              description: "Updated definition and next future occurrence",
              content: jsonContent("WorkRecurrenceDefinition"),
            },
            "409": {
              description: "Definition changed concurrently",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/recurrence/occurrences": {
        get: {
          operationId: "listWorkRecurrenceOccurrences",
          summary:
            "Page through queued, generated, and failed task occurrences",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Local recurring Work occurrence page",
              content: jsonContent("ListWorkRecurrenceOccurrencesResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/recurrence/audit": {
        get: {
          operationId: "listWorkRecurrenceAudit",
          summary: "Page through immutable recurring Work audit events",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Recurring Work audit page",
              content: jsonContent("ListWorkRecurrenceAuditResponse"),
            },
          },
        },
      },
      "/api/v1/work-recurrence-occurrences/{id}": {
        get: {
          operationId: "getWorkRecurrenceOccurrence",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact local task occurrence",
              content: jsonContent("WorkRecurrenceOccurrence"),
            },
            "404": {
              description: "Occurrence not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-item-assignment-events/{id}": {
        get: {
          operationId: "getWorkAssignmentEvent",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact immutable assignment evidence",
              content: jsonContent("WorkItemAssignmentEvent"),
            },
            "404": {
              description: "Assignment event not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/planning-events": {
        get: {
          operationId: "listWorkItemPlanningEvents",
          summary: "List immutable local task planning changes",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Planning history page",
              content: jsonContent("ListWorkItemPlanningEventsResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/upcoming": {
        get: {
          operationId: "listUpcomingWork",
          summary: "List open dated tasks across projects in date order",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Upcoming work page with cursor continuation",
              content: jsonContent("ListUpcomingWorkResponse"),
            },
          },
        },
      },
      "/api/v1/work-items": {
        get: {
          operationId: "listWorkspaceWork",
          summary: "Page through local tasks across projects",
          parameters: [
            ...pageParameters,
            projectFilterParameter,
            {
              in: "query",
              name: "status",
              required: false,
              schema: { type: "string", enum: ["open", "done"] },
            },
          ],
          responses: {
            "200": {
              description: "Source-linked task page with project names",
              content: jsonContent("ListWorkspaceWorkResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/status": {
        post: {
          operationId: "changeWorkItemStatus",
          summary:
            "Complete or reopen a task against its expected current state",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("ChangeWorkItemStatusRequest"),
          },
          responses: {
            "200": {
              description: "Updated work item",
              content: jsonContent("WorkItem"),
            },
            "409": {
              description: "Status changed concurrently",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/status-events": {
        get: {
          operationId: "listWorkItemStatusEvents",
          summary:
            "List immutable task status changes with cursor continuation",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Status history page",
              content: jsonContent("ListWorkItemStatusEventsResponse"),
            },
            "404": {
              description: "Work item not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/comments": {
        get: {
          operationId: "listWorkItemComments",
          summary: "Page through immutable local task discussion",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Task comments with source identity",
              content: jsonContent("ListWorkItemCommentsResponse"),
            },
          },
        },
        post: {
          operationId: "createWorkItemComment",
          summary: "Append a local comment to the exact task",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateWorkItemCommentRequest"),
          },
          responses: {
            "201": {
              description: "Preserved local task comment",
              content: jsonContent("WorkItemComment"),
            },
            "404": {
              description: "Task not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/relations": {
        get: {
          operationId: "listWorkItemRelations",
          summary: "Page active incoming or outgoing work relationships",
          parameters: [
            idParameter,
            {
              in: "query",
              name: "direction",
              required: true,
              schema: { type: "string", enum: ["outgoing", "incoming"] },
            },
            ...pageParameters,
          ],
          responses: {
            "200": {
              description: "Active typed work relationship page",
              content: jsonContent("ListWorkItemRelationsResponse"),
            },
            "404": {
              description: "Work item not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-item-relations": {
        post: {
          operationId: "createWorkItemRelation",
          summary: "Link project work through parent or blocking meaning",
          requestBody: {
            required: true,
            content: jsonContent("CreateWorkItemRelationRequest"),
          },
          responses: {
            "201": {
              description: "New typed work relationship",
              content: jsonContent("WorkItemRelation"),
            },
            "409": {
              description: "Project, parent, duplicate, or cycle conflict",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-item-relations/{id}": {
        get: {
          operationId: "getWorkItemRelation",
          summary:
            "Read one exact work relationship, including archived history",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact work relationship",
              content: jsonContent("WorkItemRelation"),
            },
            "404": {
              description: "Relationship not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        delete: {
          operationId: "archiveWorkItemRelation",
          summary: "Archive one active work relationship with audit history",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Archived relationship",
              content: jsonContent("WorkItemRelation"),
            },
            "404": {
              description: "Relationship not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/attachments": {
        get: {
          operationId: "listWorkItemAttachments",
          summary: "Page active source-backed document attachments for a task",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Task document attachment page",
              content: jsonContent("ListWorkItemAttachmentsResponse"),
            },
            "404": {
              description: "Task not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        post: {
          operationId: "attachDocumentToWorkItem",
          summary: "Link an existing same-project Knowledge document to a task",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateWorkItemAttachmentRequest"),
          },
          responses: {
            "201": {
              description: "Audited task document attachment",
              content: jsonContent("WorkItemAttachment"),
            },
            "409": {
              description: "Duplicate or cross-project document link",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-item-attachments/{id}": {
        get: {
          operationId: "getWorkItemAttachment",
          summary: "Read one task document link, including archived history",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact task document link",
              content: jsonContent("WorkItemAttachment"),
            },
            "404": {
              description: "Attachment not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        delete: {
          operationId: "archiveWorkItemAttachment",
          summary: "Archive one active task document link with audit history",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Archived task document link",
              content: jsonContent("WorkItemAttachment"),
            },
            "409": {
              description: "Link is already archived",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/acceptance": {
        get: {
          operationId: "getWorkItemAcceptance",
          summary: "Read current task acceptance criteria and revision number",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Current acceptance criteria",
              content: jsonContent("WorkItemAcceptance"),
            },
          },
        },
        put: {
          operationId: "saveWorkItemAcceptance",
          summary:
            "Revise task acceptance criteria with optimistic concurrency and audit",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SaveWorkItemAcceptanceRequest"),
          },
          responses: {
            "200": {
              description: "Saved acceptance criteria",
              content: jsonContent("WorkItemAcceptance"),
            },
            "409": {
              description: "Task or revision conflict",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/acceptance-revisions": {
        get: {
          operationId: "listWorkItemAcceptanceRevisions",
          summary: "Page immutable task acceptance revisions",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Acceptance revision page",
              content: jsonContent("ListWorkItemAcceptanceRevisionsResponse"),
            },
          },
        },
      },
      "/api/v1/work-item-acceptance-revisions/{id}": {
        get: {
          operationId: "getWorkItemAcceptanceRevision",
          summary: "Read one exact acceptance revision",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact acceptance revision",
              content: jsonContent("WorkItemAcceptanceRevision"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/verifications": {
        get: {
          operationId: "listWorkItemVerifications",
          summary: "Page manual task acceptance review claims",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Manual review page",
              content: jsonContent("ListWorkItemVerificationsResponse"),
            },
          },
        },
        post: {
          operationId: "recordWorkItemVerification",
          summary:
            "Record an audited manual acceptance review against an attached original document",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateWorkItemVerificationRequest"),
          },
          responses: {
            "201": {
              description: "Manual review record",
              content: jsonContent("WorkItemVerification"),
            },
            "409": {
              description: "Task, revision, or document scope conflict",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-item-verifications/{id}": {
        get: {
          operationId: "getWorkItemVerification",
          summary: "Read one exact manual review and source document link",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact manual review record",
              content: jsonContent("WorkItemVerification"),
            },
          },
        },
      },
      "/api/v1/knowledge-items/{id}": {
        get: {
          operationId: "getKnowledgeItem",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Exact knowledge note and source capture reference",
              content: jsonContent("KnowledgeItem"),
            },
            "404": {
              description: "Knowledge item not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/knowledge-items/{id}/work-attachments": {
        get: {
          operationId: "listWorkAttachedToKnowledge",
          summary: "Page the tasks that cite this original file document",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Inverse task attachment page",
              content: jsonContent("ListWorkItemAttachmentsResponse"),
            },
            "404": {
              description: "Document not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/knowledge-items/{id}/revisions": {
        get: {
          operationId: "listKnowledgeItemRevisions",
          summary: "List immutable local note edits with cursor continuation",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Knowledge note revision history",
              content: jsonContent("ListKnowledgeItemRevisionsResponse"),
            },
          },
        },
        post: {
          operationId: "reviseKnowledgeItem",
          summary: "Edit a filed note without changing its original capture",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("ReviseKnowledgeItemRequest"),
          },
          responses: {
            "200": {
              description: "Current note after the revision",
              content: jsonContent("KnowledgeItem"),
            },
            "409": {
              description: "Stale or unchanged note revision",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/work-items/{id}/execution-packets": {
        get: {
          operationId: "listExecutionPacketsForWorkItem",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Packet versions with cursor continuation",
              content: jsonContent("ListExecutionPacketsResponse"),
            },
            "404": {
              description: "Work item not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        post: {
          operationId: "createExecutionPacket",
          summary:
            "Create an immutable packet with explicitly selected project context",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateExecutionPacketRequest"),
          },
          responses: {
            "201": {
              description: "Created point-in-time packet",
              content: jsonContent("ExecutionPacket"),
            },
            "400": {
              description: "Invalid or cross-project selection",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Work item not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/execution-packets/{id}": {
        get: {
          operationId: "getExecutionPacket",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Immutable execution packet snapshot",
              content: jsonContent("ExecutionPacket"),
            },
            "404": {
              description: "Execution packet not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/agents": {
        get: {
          operationId: "listLocalAgents",
          summary: "Page through synthetic local agent profiles",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Agent profile page",
              content: jsonContent("ListLocalAgentsResponse"),
            },
          },
        },
        post: {
          operationId: "createLocalAgent",
          summary: "Create a provisional synthetic local agent profile",
          requestBody: {
            required: true,
            content: jsonContent("CreateLocalAgentRequest"),
          },
          responses: {
            "201": {
              description: "Synthetic local agent",
              content: jsonContent("LocalAgentProfile"),
            },
            "400": {
              description: "Invalid profile",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/eligible-agents": {
        get: {
          operationId: "listProjectEligibleAgents",
          summary: "Page through synthetic agents scoped to this project",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Eligible synthetic agent profile page",
              content: jsonContent("ListProjectEligibleAgentsResponse"),
            },
          },
        },
      },
      "/api/v1/agents/{id}": {
        get: {
          operationId: "getLocalAgent",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Synthetic local agent profile",
              content: jsonContent("LocalAgentProfile"),
            },
            "404": {
              description: "Agent not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/agents/{id}/projects": {
        get: {
          operationId: "listLocalAgentProjects",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Agent project assignments",
              content: jsonContent("ListLocalAgentProjectAssignmentsResponse"),
            },
            "404": {
              description: "Agent not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        post: {
          operationId: "assignLocalAgentProject",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateLocalAgentProjectAssignmentRequest"),
          },
          responses: {
            "201": {
              description: "Synthetic agent project assignment",
              content: jsonContent("LocalAgentProjectAssignment"),
            },
            "404": {
              description: "Agent or project not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Assignment exists",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/execution-packets/{id}/agent-runs": {
        post: {
          operationId: "submitLocalAgentRun",
          summary: "Queue an idempotent packet-bound synthetic local fake run",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateLocalAgentRunRequest"),
          },
          responses: {
            "202": {
              description: "Queued or existing fake run",
              content: jsonContent("LocalAgentRun"),
            },
            "403": {
              description: "Agent is not assigned to packet project",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Packet or agent not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Occurrence conflict",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/agent-runs/{id}": {
        get: {
          operationId: "getLocalAgentRun",
          parameters: [idParameter],
          responses: {
            "200": {
              description:
                "Synthetic run with grant, attempts and unverified result",
              content: jsonContent("LocalAgentRun"),
            },
            "404": {
              description: "Run not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/overnight": {
        get: {
          operationId: "listOvernightQueue",
          summary: "Page labeled synthetic local overnight work and results",
          parameters: [projectFilterParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Overnight queue page",
              content: jsonContent("ListOvernightQueueResponse"),
            },
          },
        },
        post: {
          operationId: "scheduleOvernightQueueEntry",
          summary: "Schedule a packet-bound fake local agent run",
          requestBody: {
            required: true,
            content: jsonContent("CreateOvernightQueueEntryRequest"),
          },
          responses: {
            "201": {
              description: "Scheduled synthetic entry",
              content: jsonContent("OvernightQueueEntry"),
            },
            "409": {
              description: "Packet, work, or assignment is not ready",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/overnight/readiness": {
        get: {
          operationId: "getOvernightReadiness",
          parameters: [
            {
              in: "query",
              name: "packetId",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              in: "query",
              name: "agentId",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Current synthetic scheduling readiness",
              content: jsonContent("OvernightReadiness"),
            },
          },
        },
      },
      "/api/v1/overnight/{id}": {
        get: {
          operationId: "getOvernightQueueEntry",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Queue entry and linked run state",
              content: jsonContent("OvernightQueueEntry"),
            },
          },
        },
      },
      "/api/v1/overnight/{id}/cancel": {
        post: {
          operationId: "cancelOvernightQueueEntry",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Canceled scheduled entry",
              content: jsonContent("OvernightQueueEntry"),
            },
            "409": {
              description: "Entry already dispatched or blocked",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/overnight/{id}/audit": {
        get: {
          operationId: "listOvernightQueueAudit",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Immutable queue transition audit page",
              content: jsonContent("ListOvernightQueueAuditResponse"),
            },
          },
        },
      },
      "/api/v1/mcp-sessions": {
        get: {
          operationId: "listLocalMcpSessions",
          summary:
            "Page packet-scoped local MCP read sessions without bearer tokens",
          parameters: [
            {
              in: "query",
              name: "packetId",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
            ...pageParameters,
          ],
          responses: {
            "200": {
              description: "Local MCP read sessions",
              content: jsonContent("ListLocalMcpSessionsResponse"),
            },
          },
        },
        post: {
          operationId: "createLocalMcpSession",
          summary:
            "Create a short-lived packet-scoped read session; return token once",
          requestBody: {
            required: true,
            content: jsonContent("CreateLocalMcpSessionRequest"),
          },
          responses: {
            "201": {
              description: "Created local read session with one-time token",
              content: jsonContent("CreatedLocalMcpSession"),
            },
            "403": {
              description: "Agent is not assigned to the packet project",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/mcp-sessions/{id}": {
        get: {
          operationId: "getLocalMcpSession",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Local read session without token",
              content: jsonContent("LocalMcpSession"),
            },
          },
        },
      },
      "/api/v1/mcp-sessions/{id}/revoke": {
        post: {
          operationId: "revokeLocalMcpSession",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Revoked local read session",
              content: jsonContent("LocalMcpSession"),
            },
          },
        },
      },
      "/api/v1/mcp-sessions/{id}/audit": {
        get: {
          operationId: "listLocalMcpSessionAudit",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Local read session audit page",
              content: jsonContent("ListLocalMcpAuditResponse"),
            },
          },
        },
      },
      "/api/v1/agent-runs/{id}/context-reads": {
        post: {
          operationId: "readLocalAgentContext",
          summary:
            "Check project, operation, run state and expiry before an audited local read",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("AgentContextReadRequest"),
          },
          responses: {
            "200": {
              description: "Scoped context and allowed audit identity",
              content: jsonContent("AgentContextReadResponse"),
            },
            "403": {
              description:
                "Scope, operation, state or expiry denied and audited",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Run or context not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/agent-runs/{id}/audit": {
        get: {
          operationId: "listLocalAgentRunAudit",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description:
                "Cursor page of queue, attempt and read audit events",
              content: jsonContent("ListAgentRunAuditResponse"),
            },
            "404": {
              description: "Run not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/agent-runs/{id}/simulated-actions": {
        post: {
          operationId: "proposeSimulatedResourceRestart",
          summary:
            "Propose one exact packet-selected resource for a no-effect local restart simulation",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateSimulatedActionRequest"),
          },
          responses: {
            "201": {
              description: "Pending or existing synthetic action proposal",
              content: jsonContent("SimulatedApproval"),
            },
            "400": {
              description: "Invalid action proposal input",
              content: jsonContent("ErrorResponse"),
            },
            "403": {
              description: "Local mode or target project scope denied",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Run, packet, or target link not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Packet, target, or occurrence conflict",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/approvals": {
        get: {
          operationId: "listSimulatedApprovals",
          summary: "Page through provisional local simulated approvals",
          parameters: [
            ...pageParameters,
            {
              in: "query",
              name: "state",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "pending",
                  "approved",
                  "rejected",
                  "cancelled",
                  "expired",
                ],
              },
            },
          ],
          responses: {
            "200": {
              description: "Approval page with continuation cursor",
              content: jsonContent("ListSimulatedApprovalsResponse"),
            },
            "400": {
              description: "Invalid page query",
              content: jsonContent("ErrorResponse"),
            },
            "403": {
              description: "Only local and test approval review is available",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/approvals/{id}": {
        get: {
          operationId: "getSimulatedApproval",
          parameters: [idParameter],
          responses: {
            "200": {
              description:
                "Exact immutable descriptor, decision, and no-effect outcome",
              content: jsonContent("SimulatedApproval"),
            },
            "403": {
              description: "Only local and test approval review is available",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Approval not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/approvals/{id}/decisions": {
        post: {
          operationId: "decideSimulatedApproval",
          summary:
            "Approve, reject, or cancel only the exact no-effect local descriptor",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SimulatedApprovalDecisionRequest"),
          },
          responses: {
            "200": {
              description: "Decision and current approval state",
              content: jsonContent("SimulatedApproval"),
            },
            "400": {
              description: "Invalid decision input",
              content: jsonContent("ErrorResponse"),
            },
            "403": {
              description: "Only local and test approval review is available",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Approval not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Digest, occurrence, state, or expiry conflict",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/approvals/{id}/audit": {
        get: {
          operationId: "listSimulatedApprovalAudit",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description:
                "Cursor page of proposal, decisions, expiry and no-effect result",
              content: jsonContent("ListSimulatedApprovalAuditResponse"),
            },
            "403": {
              description: "Only local and test approval review is available",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Approval not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/knowledge-items": {
        get: {
          operationId: "listWorkspaceKnowledge",
          summary: "Page through source-linked notes across projects",
          parameters: [...pageParameters, projectFilterParameter],
          responses: {
            "200": {
              description: "Knowledge note page with project names",
              content: jsonContent("ListWorkspaceKnowledgeResponse"),
            },
          },
        },
      },
      "/api/v1/decisions": {
        get: {
          operationId: "listWorkspaceDecisions",
          summary: "Page through local decisions across projects",
          parameters: [...pageParameters, projectFilterParameter],
          responses: {
            "200": {
              description: "Decision page with project names",
              content: jsonContent("ListWorkspaceDecisionsResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/work": {
        get: {
          operationId: "listProjectWork",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "A page of project work items",
              content: jsonContent("ListWorkItemsResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/knowledge": {
        get: {
          operationId: "listProjectKnowledge",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "A page of project knowledge notes",
              content: jsonContent("ListKnowledgeItemsResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/decisions": {
        get: {
          operationId: "listProjectDecisions",
          summary: "Page through manually recorded project decisions",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "A page of decisions",
              content: jsonContent("ListProjectDecisionsResponse"),
            },
          },
        },
        post: {
          operationId: "createProjectDecision",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("CreateProjectDecisionRequest"),
          },
          responses: {
            "201": {
              description: "Decision and first immutable revision",
              content: jsonContent("ProjectDecision"),
            },
          },
        },
      },
      "/api/v1/decisions/{id}": {
        get: {
          operationId: "getProjectDecision",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Current decision",
              content: jsonContent("ProjectDecision"),
            },
          },
        },
        put: {
          operationId: "reviseProjectDecision",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("ReviseProjectDecisionRequest"),
          },
          responses: {
            "200": {
              description: "Updated decision and immutable new revision",
              content: jsonContent("ProjectDecision"),
            },
            "409": {
              description: "Stale or terminal decision",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/decisions/{id}/revisions": {
        get: {
          operationId: "listProjectDecisionRevisions",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Immutable decision revision page",
              content: jsonContent("ListProjectDecisionRevisionsResponse"),
            },
          },
        },
      },
      "/api/v1/automations": {
        get: {
          operationId: "listLocalAutomations",
          summary: "Page local-only automation definitions",
          parameters: [projectFilterParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Automation definition page",
              content: jsonContent("ListAutomationDefinitionsResponse"),
            },
          },
        },
        post: {
          operationId: "createLocalAutomation",
          summary:
            "Create a local read-only summary routine and queue its on-creation run if enabled",
          requestBody: {
            required: true,
            content: jsonContent("CreateAutomationDefinitionRequest"),
          },
          responses: {
            "201": {
              description: "Created local automation",
              content: jsonContent("AutomationDefinition"),
            },
          },
        },
      },
      "/api/v1/morning-digest": {
        get: {
          operationId: "listLocalMorningDigest",
          summary:
            "Page unverified local automation and agent outcomes in an explicit UTC window",
          parameters: [
            {
              in: "query",
              name: "from",
              required: true,
              schema: { type: "string", format: "date-time" },
            },
            {
              in: "query",
              name: "to",
              required: true,
              schema: { type: "string", format: "date-time" },
            },
            projectFilterParameter,
            {
              in: "query",
              name: "limit",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 100,
                default: 20,
              },
            },
            {
              in: "query",
              name: "cursor",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Source-linked local morning digest page",
              content: jsonContent("MorningDigestResponse"),
            },
          },
        },
      },
      "/api/v1/automations/{id}": {
        get: {
          operationId: "getLocalAutomation",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Automation definition",
              content: jsonContent("AutomationDefinition"),
            },
          },
        },
      },
      "/api/v1/automations/{id}/enabled": {
        put: {
          operationId: "setLocalAutomationEnabled",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SetAutomationEnabledRequest"),
          },
          responses: {
            "200": {
              description: "Updated enabled state",
              content: jsonContent("AutomationDefinition"),
            },
            "409": {
              description: "Stale enabled state",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/automations/{id}/runs": {
        get: {
          operationId: "listLocalAutomationRuns",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Run history page",
              content: jsonContent("ListAutomationRunsResponse"),
            },
          },
        },
        post: {
          operationId: "triggerLocalAutomationRun",
          summary: "Manually queue an enabled local read-only summary",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("TriggerAutomationRunRequest"),
          },
          responses: {
            "202": {
              description: "Queued or idempotently returned run",
              content: jsonContent("AutomationRun"),
            },
            "409": {
              description: "Disabled or conflicting occurrence",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/automations/{id}/audit": {
        get: {
          operationId: "listLocalAutomationAudit",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Audit event page",
              content: jsonContent("ListAutomationAuditResponse"),
            },
          },
        },
      },
      "/api/v1/automation-runs/{id}": {
        get: {
          operationId: "getLocalAutomationRun",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Run and synthetic result",
              content: jsonContent("AutomationRun"),
            },
          },
        },
      },
      "/api/v1/automation-runs/{id}/attempts": {
        get: {
          operationId: "listLocalAutomationRunAttempts",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Attempt history page",
              content: jsonContent("ListAutomationRunAttemptsResponse"),
            },
          },
        },
      },
      "/api/v1/notifications": {
        get: {
          operationId: "listLocalNotifications",
          summary:
            "Page source-backed local notifications without outbound delivery",
          parameters: [
            {
              in: "query",
              name: "limit",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 100,
                default: 25,
              },
            },
            {
              in: "query",
              name: "cursor",
              required: false,
              schema: { type: "string" },
            },
            {
              in: "query",
              name: "view",
              required: false,
              schema: {
                type: "string",
                enum: ["active", "all"],
                default: "active",
              },
            },
            projectFilterParameter,
          ],
          responses: {
            "200": {
              description: "Notification page",
              content: jsonContent("ListNotificationsResponse"),
            },
            "400": {
              description: "Invalid page query or cursor",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/notifications/{id}": {
        get: {
          operationId: "getLocalNotification",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Current source-backed notification",
              content: jsonContent("Notification"),
            },
            "404": {
              description: "Source is no longer current",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/notifications/{id}/state": {
        put: {
          operationId: "changeLocalNotificationState",
          summary:
            "Locally acknowledge, dismiss, snooze, or restore a notification",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent("ChangeNotificationStateRequest"),
          },
          responses: {
            "200": {
              description: "Updated local receipt",
              content: jsonContent("Notification"),
            },
            "409": {
              description: "Stale expected version",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/notifications/{id}/audit": {
        get: {
          operationId: "listLocalNotificationAudit",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
            ...pageParameters,
          ],
          responses: {
            "200": {
              description: "Immutable notification state history",
              content: jsonContent("ListNotificationAuditResponse"),
            },
          },
        },
      },
      "/api/v1/search": {
        get: {
          operationId: "searchRecords",
          summary: "PostgreSQL full-text search of local records",
          parameters: [
            {
              in: "query",
              name: "q",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 200 },
            },
            {
              in: "query",
              name: "projectId",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
            ...pageParameters,
          ],
          responses: {
            "200": {
              description: "A page of evidence-linked search results",
              content: jsonContent("SearchResponse"),
            },
            "400": {
              description: "Invalid search query",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/integrations": {
        get: {
          operationId: "listLocalIntegrations",
          summary: "Page through configured local fixture sources",
          parameters: [...pageParameters, projectFilterParameter],
          responses: {
            "200": {
              description: "Local integration page with observed sync state",
              content: jsonContent("ListLocalIntegrationsResponse"),
            },
          },
        },
        post: {
          operationId: "createLocalIntegration",
          summary:
            "Create a project-bound local fixture source in local or test mode",
          requestBody: {
            required: true,
            content: jsonContent("CreateLocalIntegrationRequest"),
          },
          responses: {
            "201": {
              description: "Configured local source",
              content: jsonContent("LocalIntegration"),
            },
            "403": {
              description: "Local fixture writes are disabled",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/integrations/{id}": {
        get: {
          operationId: "getLocalIntegration",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Configured local source and observed sync state",
              content: jsonContent("LocalIntegration"),
            },
            "404": {
              description: "Source not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/integrations/{id}/enabled": {
        put: {
          operationId: "setLocalIntegrationEnabled",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SetLocalIntegrationEnabledRequest"),
          },
          responses: {
            "200": {
              description: "Updated source",
              content: jsonContent("LocalIntegration"),
            },
            "403": {
              description: "Local fixture writes are disabled",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/integrations/{id}/sample": {
        post: {
          operationId: "runLocalIntegrationSample",
          summary:
            "Queue a labeled, replay-safe development or operations fixture",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("RunLocalIntegrationSampleRequest"),
          },
          responses: {
            "202": {
              description: "Synthetic import receipt",
              content: jsonContent("SyntheticEventImport"),
            },
            "403": {
              description: "Local fixture writes are disabled",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description:
                "Disabled source, unlinked resource, or occurrence conflict",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/synthetic-event-imports": {
        get: {
          operationId: "listSyntheticEventImports",
          summary: "Page through locally submitted synthetic imports",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "A page of synthetic imports",
              content: jsonContent("ListSyntheticEventImportsResponse"),
            },
            "400": {
              description: "Invalid page query",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        post: {
          operationId: "createSyntheticEventImport",
          summary: "Submit a fixed synthetic fixture in local or test mode",
          requestBody: {
            required: true,
            content: jsonContent("CreateSyntheticEventImportRequest"),
          },
          responses: {
            "202": {
              description: "Queued or existing import",
              content: jsonContent("SyntheticEventImport"),
            },
            "400": {
              description: "Invalid fixture or missing required resource",
              content: jsonContent("ErrorResponse"),
            },
            "403": {
              description: "Only local and test imports are allowed",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Project or resource not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Occurrence conflict or unlinked resource",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/synthetic-event-imports/{id}": {
        get: {
          operationId: "getSyntheticEventImport",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Import processing state and evidence",
              content: jsonContent("SyntheticEventImport"),
            },
            "404": {
              description: "Import not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/events": {
        get: {
          operationId: "listNormalizedEvents",
          summary: "Page through normalized synthetic activity",
          parameters: [
            ...pageParameters,
            projectFilterParameter,
            resourceFilterParameter,
          ],
          responses: {
            "200": {
              description: "An evidence-linked activity page",
              content: jsonContent("ListNormalizedEventsResponse"),
            },
            "400": {
              description: "Invalid event query",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/metrics": {
        get: {
          operationId: "listSyntheticMetricSamples",
          summary: "Page through source-labeled synthetic operational samples",
          parameters: [
            ...pageParameters,
            projectFilterParameter,
            resourceFilterParameter,
          ],
          responses: {
            "200": {
              description: "An immutable synthetic metric sample page",
              content: jsonContent("ListSyntheticMetricsResponse"),
            },
            "400": {
              description: "Invalid metric query",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/metrics/{id}": {
        get: {
          operationId: "getSyntheticMetricSample",
          summary:
            "Read the exact immutable synthetic metric sample used as evidence",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Synthetic metric sample with source reference",
              content: jsonContent("SyntheticMetricSample"),
            },
            "404": {
              description: "Metric sample not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/events/{id}": {
        get: {
          operationId: "getNormalizedEvent",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Normalized event with source reference",
              content: jsonContent("NormalizedEvent"),
            },
            "404": {
              description: "Event not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/source-envelopes/{id}": {
        get: {
          operationId: "getSourceEnvelope",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Immutable synthetic source evidence",
              content: jsonContent("SourceEnvelope"),
            },
            "404": {
              description: "Source envelope not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/alerts": {
        get: {
          operationId: "listAlerts",
          summary: "Page through open and resolved synthetic alert conditions",
          parameters: [
            ...pageParameters,
            projectFilterParameter,
            resourceFilterParameter,
            {
              in: "query",
              name: "state",
              required: false,
              schema: { type: "string", enum: ["open", "resolved"] },
            },
          ],
          responses: {
            "200": {
              description: "Alert conditions with rule and evidence",
              content: jsonContent("ListSyntheticAlertsResponse"),
            },
            "400": {
              description: "Invalid alert query",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/alerts/{id}": {
        get: {
          operationId: "getAlert",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Synthetic alert condition and evidence",
              content: jsonContent("SyntheticAlert"),
            },
            "404": {
              description: "Alert not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/attention": {
        get: {
          operationId: "listAttention",
          summary: "Page through open synthetic monitor attention",
          parameters: [...pageParameters, projectFilterParameter],
          responses: {
            "200": {
              description: "Explainable attention from open synthetic alerts",
              content: jsonContent("ListAttentionResponse"),
            },
            "400": {
              description: "Invalid attention query",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/synthetic-runs": {
        post: {
          operationId: "createSyntheticRun",
          summary: "Submit an idempotent synthetic worker run",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateSyntheticRunRequest",
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Queued or existing run",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SyntheticRun" },
                },
              },
            },
          },
        },
      },
      "/api/v1/synthetic-runs/{id}": {
        get: {
          operationId: "getSyntheticRun",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Product run record",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SyntheticRun" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: component(healthResponseSchema),
        ErrorResponse: component(errorResponseSchema),
        CorrelationMetadata: component(correlationMetadataSchema),
        VersionResponse: component(versionResponseSchema),
        ResourceSummary: component(resourceSummarySchema),
        CreateResourceRequest: component(createResourceRequestSchema),
        ListResourcesResponse: component(listResourcesResponseSchema),
        SetResourceParentRequest: component(setResourceParentRequestSchema),
        CreateResourceDependencyRequest: component(
          createResourceDependencyRequestSchema,
        ),
        ResourceDependency: component(resourceDependencySchema),
        ListResourceDependenciesResponse: component(
          listResourceDependenciesResponseSchema,
        ),
        ProjectSummary: component(projectSummarySchema),
        DomainSummary: component(domainSummarySchema),
        DomainAuditEvent: component(domainAuditEventSchema),
        ProjectDomainLink: component(projectDomainLinkSchema),
        ProjectDomainResponse: component(projectDomainResponseSchema),
        CreateDomainRequest: component(createDomainRequestSchema),
        UpdateDomainRequest: component(updateDomainRequestSchema),
        ArchiveDomainRequest: component(archiveDomainRequestSchema),
        SetProjectDomainRequest: component(setProjectDomainRequestSchema),
        ListDomainsResponse: component(listDomainsResponseSchema),
        ListDomainProjectsResponse: component(listDomainProjectsResponseSchema),
        ListDomainAuditResponse: component(listDomainAuditResponseSchema),
        SystemSummary: component(systemSummarySchema),
        SystemAuditEvent: component(systemAuditEventSchema),
        SystemDomainLink: component(systemDomainLinkSchema),
        SystemProjectLink: component(systemProjectLinkSchema),
        SystemResourceLink: component(systemResourceLinkSchema),
        SystemDomainResponse: component(systemDomainResponseSchema),
        SystemProjectConnection: component(systemProjectConnectionSchema),
        SystemResourceConnection: component(systemResourceConnectionSchema),
        CreateSystemRequest: component(createSystemRequestSchema),
        UpdateSystemRequest: component(updateSystemRequestSchema),
        ArchiveSystemRequest: component(archiveSystemRequestSchema),
        SetSystemDomainRequest: component(setSystemDomainRequestSchema),
        LinkSystemProjectRequest: component(linkSystemProjectRequestSchema),
        LinkSystemResourceRequest: component(linkSystemResourceRequestSchema),
        ListSystemsResponse: component(listSystemsResponseSchema),
        ListDomainSystemsResponse: component(listDomainSystemsResponseSchema),
        ListSystemProjectsResponse: component(listSystemProjectsResponseSchema),
        ListSystemResourcesResponse: component(
          listSystemResourcesResponseSchema,
        ),
        ListSystemAuditResponse: component(listSystemAuditResponseSchema),
        CreateProjectRequest: component(createProjectRequestSchema),
        ListProjectsResponse: component(listProjectsResponseSchema),
        ProjectResourceLink: component(projectResourceLinkSchema),
        ProjectResourceLinkDetail: component(projectResourceLinkDetailSchema),
        CreateProjectResourceLinkRequest: component(
          createProjectResourceLinkRequestSchema,
        ),
        ListProjectResourceLinksResponse: component(
          listProjectResourceLinksResponseSchema,
        ),
        CreateCaptureRequest: component(createCaptureRequestSchema),
        Capture: component(captureSchema),
        CaptureFileMetadata: component(captureFileMetadataSchema),
        ListCapturesResponse: component(listCapturesResponseSchema),
        FileCaptureRequest: component(fileCaptureRequestSchema),
        FileCaptureResponse: component(fileCaptureResponseSchema),
        CaptureTriageSuggestion: component(captureTriageSuggestionSchema),
        CaptureTriageDecision: component(captureTriageDecisionSchema),
        CaptureTriageReview: component(captureTriageReviewSchema),
        ReviewCaptureTriageRequest: component(reviewCaptureTriageRequestSchema),
        ReviewCaptureTriageResponse: component(
          reviewCaptureTriageResponseSchema,
        ),
        CaptureTriageJobV1: component(captureTriageJobV1Schema),
        WorkItem: component(workItemSchema),
        WorkspaceWorkItem: component(workspaceWorkItemSchema),
        ListWorkspaceWorkResponse: component(listWorkspaceWorkResponseSchema),
        ChangeWorkItemPlanningRequest: component(
          changeWorkItemPlanningRequestSchema,
        ),
        ChangeWorkAssignmentRequest: component(
          changeWorkAssignmentRequestSchema,
        ),
        WorkItemAssignmentEvent: component(workItemAssignmentEventSchema),
        ListWorkAssignmentEventsResponse: component(
          listWorkAssignmentEventsResponseSchema,
        ),
        ListProjectEligibleAgentsResponse: component(
          listProjectEligibleAgentsResponseSchema,
        ),
        CreateWorkRecurrenceRequest: component(
          createWorkRecurrenceRequestSchema,
        ),
        UpdateWorkRecurrenceRequest: component(
          updateWorkRecurrenceRequestSchema,
        ),
        WorkRecurrenceDefinition: component(workRecurrenceDefinitionSchema),
        GetWorkRecurrenceResponse: component(getWorkRecurrenceResponseSchema),
        WorkRecurrenceOccurrence: component(workRecurrenceOccurrenceSchema),
        ListWorkRecurrenceOccurrencesResponse: component(
          listWorkRecurrenceOccurrencesResponseSchema,
        ),
        WorkRecurrenceAuditEvent: component(workRecurrenceAuditEventSchema),
        ListWorkRecurrenceAuditResponse: component(
          listWorkRecurrenceAuditResponseSchema,
        ),
        WorkRecurrenceJobV1: component(workRecurrenceJobV1Schema),
        WorkItemPlanningEvent: component(workItemPlanningEventSchema),
        ListWorkItemPlanningEventsResponse: component(
          listWorkItemPlanningEventsResponseSchema,
        ),
        ListUpcomingWorkResponse: component(listUpcomingWorkResponseSchema),
        ChangeWorkItemStatusRequest: component(
          changeWorkItemStatusRequestSchema,
        ),
        WorkItemStatusEvent: component(workItemStatusEventSchema),
        ListWorkItemStatusEventsResponse: component(
          listWorkItemStatusEventsResponseSchema,
        ),
        CreateWorkItemCommentRequest: component(
          createWorkItemCommentRequestSchema,
        ),
        WorkItemComment: component(workItemCommentSchema),
        ListWorkItemCommentsResponse: component(
          listWorkItemCommentsResponseSchema,
        ),
        CreateWorkItemRelationRequest: component(
          createWorkItemRelationRequestSchema,
        ),
        WorkItemRelation: component(workItemRelationSchema),
        ListWorkItemRelationsResponse: component(
          listWorkItemRelationsResponseSchema,
        ),
        CreateWorkItemAttachmentRequest: component(
          createWorkItemAttachmentRequestSchema,
        ),
        WorkItemAttachment: component(workItemAttachmentSchema),
        ListWorkItemAttachmentsResponse: component(
          listWorkItemAttachmentsResponseSchema,
        ),
        WorkItemAcceptance: component(workItemAcceptanceSchema),
        SaveWorkItemAcceptanceRequest: component(
          saveWorkItemAcceptanceRequestSchema,
        ),
        WorkItemAcceptanceRevision: component(workItemAcceptanceRevisionSchema),
        ListWorkItemAcceptanceRevisionsResponse: component(
          listWorkItemAcceptanceRevisionsResponseSchema,
        ),
        CreateWorkItemVerificationRequest: component(
          createWorkItemVerificationRequestSchema,
        ),
        WorkItemVerification: component(workItemVerificationSchema),
        ListWorkItemVerificationsResponse: component(
          listWorkItemVerificationsResponseSchema,
        ),
        KnowledgeItem: component(knowledgeItemSchema),
        CreateKnowledgeProjectLinkRequest: component(
          createKnowledgeProjectLinkRequestSchema,
        ),
        KnowledgeProjectLink: component(knowledgeProjectLinkSchema),
        KnowledgeProjectConnection: component(knowledgeProjectConnectionSchema),
        ListKnowledgeProjectConnectionsResponse: component(
          listKnowledgeProjectConnectionsResponseSchema,
        ),
        KnowledgeProjectAuditEvent: component(knowledgeProjectAuditEventSchema),
        ListKnowledgeProjectAuditResponse: component(
          listKnowledgeProjectAuditResponseSchema,
        ),
        CreateWorkProjectLinkRequest: component(
          createWorkProjectLinkRequestSchema,
        ),
        WorkProjectLink: component(workProjectLinkSchema),
        WorkProjectConnection: component(workProjectConnectionSchema),
        ListWorkProjectConnectionsResponse: component(
          listWorkProjectConnectionsResponseSchema,
        ),
        WorkProjectAuditEvent: component(workProjectAuditEventSchema),
        ListWorkProjectAuditResponse: component(
          listWorkProjectAuditResponseSchema,
        ),
        WorkspaceKnowledgeItem: component(workspaceKnowledgeItemSchema),
        ListWorkspaceKnowledgeResponse: component(
          listWorkspaceKnowledgeResponseSchema,
        ),
        ReviseKnowledgeItemRequest: component(reviseKnowledgeItemRequestSchema),
        KnowledgeItemRevision: component(knowledgeItemRevisionSchema),
        ListKnowledgeItemRevisionsResponse: component(
          listKnowledgeItemRevisionsResponseSchema,
        ),
        CreateProjectDecisionRequest: component(
          createProjectDecisionRequestSchema,
        ),
        ReviseProjectDecisionRequest: component(
          reviseProjectDecisionRequestSchema,
        ),
        ProjectDecision: component(projectDecisionSchema),
        WorkspaceDecision: component(workspaceDecisionSchema),
        ListWorkspaceDecisionsResponse: component(
          listWorkspaceDecisionsResponseSchema,
        ),
        ProjectDecisionRevision: component(projectDecisionRevisionSchema),
        ListProjectDecisionsResponse: component(
          listProjectDecisionsResponseSchema,
        ),
        ListProjectDecisionRevisionsResponse: component(
          listProjectDecisionRevisionsResponseSchema,
        ),
        CreateAutomationDefinitionRequest: component(
          createAutomationDefinitionRequestSchema,
        ),
        SetAutomationEnabledRequest: component(
          setAutomationEnabledRequestSchema,
        ),
        TriggerAutomationRunRequest: component(
          triggerAutomationRunRequestSchema,
        ),
        AutomationDefinition: component(automationDefinitionSchema),
        AutomationRunResult: component(automationRunResultSchema),
        AutomationRun: component(automationRunSchema),
        AutomationRunAttempt: component(automationRunAttemptSchema),
        AutomationAuditEvent: component(automationAuditEventSchema),
        AutomationJobV1: component(automationJobV1Schema),
        MorningDigestItem: component(morningDigestItemSchema),
        MorningDigestResponse: component(morningDigestResponseSchema),
        ListAutomationDefinitionsResponse: component(
          listAutomationDefinitionsResponseSchema,
        ),
        ListAutomationRunsResponse: component(listAutomationRunsResponseSchema),
        ListAutomationRunAttemptsResponse: component(
          listAutomationRunAttemptsResponseSchema,
        ),
        ListAutomationAuditResponse: component(
          listAutomationAuditResponseSchema,
        ),
        Notification: component(notificationSchema),
        ListNotificationsResponse: component(listNotificationsResponseSchema),
        ChangeNotificationStateRequest: component(
          changeNotificationStateRequestSchema,
        ),
        NotificationAuditEvent: component(notificationAuditEventSchema),
        ListNotificationAuditResponse: component(
          listNotificationAuditResponseSchema,
        ),
        ListWorkItemsResponse: component(listWorkItemsResponseSchema),
        ListKnowledgeItemsResponse: component(listKnowledgeItemsResponseSchema),
        SearchResult: component(searchResultSchema),
        SearchResponse: component(searchResponseSchema),
        EvidenceReference: component(evidenceReferenceSchema),
        BriefFact: component(briefFactSchema),
        BriefSection: component(briefSectionSchema),
        NotRecorded: component(notRecordedSchema),
        BriefInference: component(briefInferenceSchema),
        ProjectBrief: component(projectBriefSchema),
        CreateExecutionPacketRequest: component(
          createExecutionPacketRequestSchema,
        ),
        ExecutionPacketSnapshot: component(executionPacketSnapshotSchema),
        ExecutionPacket: component(executionPacketSchema),
        ListExecutionPacketsResponse: component(
          listExecutionPacketsResponseSchema,
        ),
        CreateLocalAgentRequest: component(createLocalAgentRequestSchema),
        LocalAgentProfile: component(localAgentProfileSchema),
        ListLocalAgentsResponse: component(listLocalAgentsResponseSchema),
        CreateLocalAgentProjectAssignmentRequest: component(
          createLocalAgentProjectAssignmentRequestSchema,
        ),
        LocalAgentProjectAssignment: component(
          localAgentProjectAssignmentSchema,
        ),
        ListLocalAgentProjectAssignmentsResponse: component(
          listLocalAgentProjectAssignmentsResponseSchema,
        ),
        CreateLocalAgentRunRequest: component(createLocalAgentRunRequestSchema),
        LocalAgentRunJobV1: component(localAgentRunJobV1Schema),
        LocalAgentRunGrant: component(localAgentRunGrantSchema),
        LocalAgentRunAttempt: component(localAgentRunAttemptSchema),
        FakeLocalAgentRunResult: component(fakeLocalAgentRunResultSchema),
        LocalAgentRun: component(localAgentRunSchema),
        CreateOvernightQueueEntryRequest: component(
          createOvernightQueueEntryRequestSchema,
        ),
        OvernightQueueEntry: component(overnightQueueEntrySchema),
        ListOvernightQueueResponse: component(listOvernightQueueResponseSchema),
        OvernightReadiness: component(overnightReadinessSchema),
        OvernightQueueJobV1: component(overnightQueueJobV1Schema),
        OvernightQueueAuditEvent: component(overnightQueueAuditEventSchema),
        ListOvernightQueueAuditResponse: component(
          listOvernightQueueAuditResponseSchema,
        ),
        CreateLocalMcpSessionRequest: component(
          createLocalMcpSessionRequestSchema,
        ),
        CreatedLocalMcpSession: component(createdLocalMcpSessionSchema),
        LocalMcpSession: component(localMcpSessionSchema),
        ListLocalMcpSessionsResponse: component(
          listLocalMcpSessionsResponseSchema,
        ),
        LocalMcpReadRequest: component(localMcpReadRequestSchema),
        LocalMcpReadResponse: component(localMcpReadResponseSchema),
        LocalMcpAuditEvent: component(localMcpAuditEventSchema),
        ListLocalMcpAuditResponse: component(listLocalMcpAuditResponseSchema),
        AgentContextReadRequest: component(agentContextReadRequestSchema),
        AgentContextReadSource: component(agentContextReadSourceSchema),
        AgentContextReadResponse: component(agentContextReadResponseSchema),
        AgentRunAuditEvent: component(agentRunAuditEventSchema),
        ListAgentRunAuditResponse: component(listAgentRunAuditResponseSchema),
        CreateSimulatedActionRequest: component(
          createSimulatedActionRequestSchema,
        ),
        SimulatedApprovalAutomaticCeiling: component(
          simulatedApprovalAutomaticCeilingSchema,
        ),
        SimulatedApprovalDescriptor: component(
          simulatedApprovalDescriptorSchema,
        ),
        SimulatedApprovalState: component(simulatedApprovalStateSchema),
        SimulatedApprovalDecisionRequest: component(
          simulatedApprovalDecisionRequestSchema,
        ),
        SimulatedApprovalDecision: component(simulatedApprovalDecisionSchema),
        SimulatedApprovalOutcome: component(simulatedApprovalOutcomeSchema),
        SimulatedApproval: component(simulatedApprovalSchema),
        ListSimulatedApprovalsResponse: component(
          listSimulatedApprovalsResponseSchema,
        ),
        SimulatedApprovalAuditEvent: component(
          simulatedApprovalAuditEventSchema,
        ),
        ListSimulatedApprovalAuditResponse: component(
          listSimulatedApprovalAuditResponseSchema,
        ),
        SimulatedApprovalJobV1: component(simulatedApprovalJobV1Schema),
        CreateSyntheticEventImportRequest: component(
          createSyntheticEventImportRequestSchema,
        ),
        CreateLocalIntegrationRequest: component(
          createLocalIntegrationRequestSchema,
        ),
        SetLocalIntegrationEnabledRequest: component(
          setLocalIntegrationEnabledRequestSchema,
        ),
        RunLocalIntegrationSampleRequest: component(
          runLocalIntegrationSampleRequestSchema,
        ),
        LocalIntegration: component(localIntegrationSchema),
        ListLocalIntegrationsResponse: component(
          listLocalIntegrationsResponseSchema,
        ),
        SyntheticEventImportJobV1: component(syntheticEventImportJobV1Schema),
        SyntheticEventImport: component(syntheticEventImportSchema),
        ListSyntheticEventImportsResponse: component(
          listSyntheticEventImportsResponseSchema,
        ),
        SourceEnvelope: component(sourceEnvelopeSchema),
        NormalizedEvent: component(normalizedEventSchema),
        SyntheticMetricSample: component(syntheticMetricSampleSchema),
        ListSyntheticMetricsResponse: component(
          listSyntheticMetricsResponseSchema,
        ),
        ListNormalizedEventsResponse: component(
          listNormalizedEventsResponseSchema,
        ),
        SyntheticAlert: component(syntheticAlertSchema),
        ListSyntheticAlertsResponse: component(
          listSyntheticAlertsResponseSchema,
        ),
        AttentionItem: component(attentionItemSchema),
        ListAttentionResponse: component(listAttentionResponseSchema),
        CreateSyntheticRunRequest: component(createSyntheticRunRequestSchema),
        SyntheticJobV1: component(syntheticJobV1Schema),
        SyntheticRun: component(syntheticRunSchema),
      },
    },
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

const outputPath = fileURLToPath(
  new URL("../openapi/openapi.json", import.meta.url),
);
const expected = generateOpenApi();
if (process.argv.includes("--check")) {
  const actual = await readFile(outputPath, "utf8").catch(() => "");
  if (actual !== expected) {
    console.error(
      "OpenAPI artifact is stale; run pnpm --filter @commandry/contracts openapi:generate",
    );
    process.exitCode = 1;
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, expected);
}
