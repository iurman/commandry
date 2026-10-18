import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  mnemosyneImportEnvelopeSchema,
  mnemosyneImportPlanSchema,
  foundationSelectedImportInputSchema,
  foundationSelectedImportResultSchema,
  foundationImportRevisionSchema,
  foundationImportOriginalSourceSchema,
  foundationImportOriginalPageSchema,
  foundationImportOriginalQuerySchema,
  foundationCreateClientSchema,
  foundationClientSchema,
  foundationIssuedClientSchema,
  foundationClientListSchema,
  foundationFailureSchema,
  foundationReviewMemorySchema,
  foundationVerifyMemorySchema,
  foundationApproveInstructionSchema,
  foundationMemorySchema,
  foundationOwnerMemoryReadSchema,
  foundationInstructionApprovalSchema,
  foundationAssessmentSchema,
  foundationImprovementPageSchema,
  foundationImprovementDetailSchema,
  foundationImprovementDecisionInputSchema,
  foundationImprovementDecisionSchema,
  foundationFindingProposalDetailSchema,
  foundationFindingProposalReviewInputSchema,
  foundationFindingProposalReviewReceiptSchema,
  foundationOnboardingPageSchema,
  foundationOnboardingDetailSchema,
  foundationOnboardingPreviewSchema,
  foundationOnboardingReviewInputSchema,
  foundationOnboardingDecisionSchema,
  foundationOnboardingApplyInputSchema,
  foundationOnboardingOutcomeSchema,
  foundationTaskProposalDetailSchema,
  foundationTaskProposalReviewInputSchema,
  foundationTaskProposalReviewReceiptSchema,
  createKnowledgeClientSchema,
  knowledgeClientSchema,
  createdKnowledgeClientSchema,
  listKnowledgeClientsSchema,
  captureSchema,
  infrastructureOverviewSchema,
  createRealIntegrationRequestSchema,
  realIntegrationSchema,
  listRealIntegrationsResponseSchema,
  linuxHostSampleSchema,
  realSourceEnvelopeSchema,
  listRealObservationsResponseSchema,
  realReceiverTokenSchema,
  setRealIntegrationEnabledRequestSchema,
  savedViewDefinitionSchema,
  savedViewSchema,
  createSavedViewRequestSchema,
  updateSavedViewRequestSchema,
  archiveSavedViewRequestSchema,
  listSavedViewsResponseSchema,
  savedViewAuditEventSchema,
  listSavedViewAuditResponseSchema,
  localFileTextProjectionSchema,
  localFileTextJobV1Schema,
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
  localRecoveryDrillSchema,
  listLocalRecoveryDrillsResponseSchema,
  localRecoveryStatusSchema,
  localBackupEvidenceSchema,
  localReleaseRehearsalSchema,
  localReleasePreflightSchema,
  listLocalBackupsResponseSchema,
  listLocalReleaseRehearsalsResponseSchema,
  listLocalReleasePreflightsResponseSchema,
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
  localAgentRoutingCandidateSchema,
  localAgentRoutingResponseSchema,
  cachedLocalAgentResultQuerySchema,
  cachedLocalAgentResultSchema,
  cachedLocalAgentResultResponseSchema,
  projectAgentFindingSchema,
  listProjectAgentFindingsQuerySchema,
  listProjectAgentFindingsResponseSchema,
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
  localAgentCallbackRequestSchema,
  localAgentCallbackEventSchema,
  listLocalAgentCallbacksResponseSchema,
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
  setLocalIntegrationFreshnessRequestSchema,
  runLocalIntegrationSampleRequestSchema,
  localConnectorTokenSchema,
  localConnectorFeedItemSchema,
  listLocalConnectorFeedResponseSchema,
  localIntegrationSchema,
  listLocalIntegrationsResponseSchema,
  createCaptureRequestSchema,
  createProjectRequestSchema,
  updateProjectRequestSchema,
  projectMetadataEventSchema,
  listProjectMetadataEventsResponseSchema,
  projectPresentationSchema,
  updateProjectPresentationRequestSchema,
  projectPresentationEventSchema,
  listProjectPresentationEventsResponseSchema,
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
  resourceImpactResponseSchema,
  createSyntheticRunRequestSchema,
  correlationMetadataSchema,
  errorResponseSchema,
  evidenceReferenceSchema,
  briefFactSchema,
  briefSectionSchema,
  briefInferenceSchema,
  notRecordedSchema,
  projectBriefSchema,
  projectFlowKindSchema,
  projectFlowRelatedSchema,
  projectFlowItemSchema,
  listProjectFlowQuerySchema,
  listProjectFlowResponseSchema,
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
  automationEvidenceCheckSchema,
  listAutomationEvidenceChecksResponseSchema,
  automationExportPageSchema,
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
  localAttentionSettingsSchema,
  updateLocalAttentionSettingsRequestSchema,
  localAttentionReviewSchema,
  submitLocalAttentionReviewRequestSchema,
  localAttentionSignalSchema,
  listLocalAttentionSignalsResponseSchema,
  localAttentionAuditEventSchema,
  listLocalAttentionAuditResponseSchema,
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
  syntheticFlowReplaySchema,
  syntheticFlowReplayStageSchema,
  syntheticRunSchema,
  versionResponseSchema,
  workItemSchema,
  foundationProjectWorkQuerySchema,
  foundationProjectWorkPageSchema,
  observatorySceneQuerySchema,
  observatorySceneReadResultSchema,
  observatoryMembershipQuerySchema,
  observatoryMembershipPageSchema,
  observatoryRelationsQuerySchema,
  observatoryRelationsResultSchema,
  observatorySignalEvidenceQuerySchema,
  observatorySignalEvidenceResultSchema,
  observatoryProviderExplanationQuerySchema,
  observatoryProviderExplanationResultSchema,
  observatoryOperationalEvidenceQuerySchema,
  observatoryOperationalEvidenceResultSchema,
  observatoryCatalogueQuerySchema,
  observatoryCatalogueResultSchema,
  observatoryLogoQuerySchema,
  observatoryLogoReadResultSchema,
  observatoryLogoPreviewSchema,
  observatoryLogoPreviewResultSchema,
  observatoryLogoChangeSchema,
  observatoryLogoFailureSchema,
  observatoryProviderFeedQuerySchema,
  observatoryProviderFeedResultSchema,
  observatoryAnnotationChangeSchema,
  observatoryRelationChangeSchema,
  observatoryProviderMappingChangeSchema,
  observatorySourceBindingChangeSchema,
  observatoryClientScopeChangeSchema,
  observatoryViewCreateSchema,
  observatoryViewUpdateSchema,
  observatoryViewDeleteSchema,
  observatoryViewReadSchema,
  observatoryViewPageQuerySchema,
  observatoryViewSchema,
  observatoryViewPageSchema,
  observatoryViewDeletedSchema,
} from "./index";

function component(
  schema: z.ZodType,
  io: "input" | "output" = "output",
): Record<string, unknown> {
  const definition: Record<string, unknown> = z.toJSONSchema(schema, { io });
  delete definition.$schema;
  return definition;
}

function jsonContent(schema: string) {
  return {
    "application/json": { schema: { $ref: `#/components/schemas/${schema}` } },
  };
}

const workflowProjectParameter = {
  in: "query",
  name: "projectId",
  required: true,
  schema: { type: "string", format: "uuid" },
};
function workflowResponses(schema: string) {
  return Object.fromEntries([
    [
      "200",
      {
        description:
          "Strict current owner result or exact historical mutation receipt; no-store",
        content: jsonContent(schema),
      },
    ],
    ...[400, 401, 403, 404, 409, 413, 503].map((status) => [
      String(status),
      {
        description:
          "Invalid input, owner session/origin denial, unavailable scope, stale comparison or unavailable result; safe code only",
        content: jsonContent("FoundationFailure"),
      },
    ]),
  ]);
}
function workflowRead(
  operationId: string,
  schema: string,
  selection: "page" | "id" | "capture",
  summary: string,
) {
  return {
    get: {
      operationId,
      summary,
      description:
        "Live allowlisted owner password session required. Machine credentials grant no owner authority. Strict query rejects unknown or duplicate keys. No-store; reads audit the exact workflow read operation. Follow every nextCursor to reach the full scoped population.",
      parameters: [
        workflowProjectParameter,
        ...(selection === "id"
          ? [idParameter]
          : selection === "capture"
            ? [{ ...idParameter, name: "captureId" }]
            : [
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
                  schema: { type: "string", minLength: 1, maxLength: 8192 },
                },
              ]),
      ],
      responses: workflowResponses(schema),
    },
  };
}
function workflowWrite(
  operationId: string,
  input: string,
  output: string,
  description: string,
) {
  return {
    post: {
      operationId,
      summary: description,
      description:
        "Sensitive owner-only action requires the actual live allowlisted password session and trusted Origin. Strict JSON and exact project/digest/version preconditions; scoped Idempotency-Key recovers the original immutable receipt. Same transaction canonical records and audit. No machine grant, shell, inference, installation or external action. " +
        description,
      parameters: [
        ownerOriginParameter,
        {
          in: "header",
          name: "Idempotency-Key",
          required: true,
          schema: { type: "string", minLength: 1, maxLength: 200 },
        },
      ],
      requestBody: { required: true, content: jsonContent(input) },
      responses: workflowResponses(output),
    },
  };
}

const ownerOriginParameter = {
  in: "header",
  name: "Origin",
  required: true,
  description:
    "Configured trusted application origin required for owner mutations",
  schema: { type: "string", format: "uri", minLength: 1 },
};

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

const observatoryResponseHeaders = {
  "Cache-Control": {
    description: "Owner results and safe failures are never cached",
    schema: { type: "string", const: "no-store" },
  },
  "X-Correlation-Id": {
    description:
      "Accepted safe request correlation ID, otherwise a new server UUID",
    schema: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      pattern: "^[a-zA-Z0-9_-]+$",
    },
  },
};
const observatoryOwnerAuthority =
  "An actual live allowlisted owner password session and a nonempty trusted Origin are required. No machine bearer credential grants owner authority, and JSON cannot assert an owner, session, capability or grant. ";
const observatoryReadAuthority =
  "Low-risk read, canonically audited as observatory.read. In password mode an actual live allowlisted owner password session and a nonempty trusted Origin are required. Only the explicitly enabled local auth-off read path permits an absent Origin; a supplied foreign Origin is always denied. No machine bearer credential grants owner authority; machines use their separately scoped MCP read tools. Reading does not probe a service, refresh observation time, create health evidence or build history. ";
function observatoryPost(
  operationId: string,
  input: string,
  output: string,
  summary: string,
  description: string,
  options: {
    read?: boolean;
    conflict?: boolean;
    notFound?: boolean;
    maximumBytes?: number;
    /** Also documents ObservatoryLogoFailure bodies, including 502. */
    logo?: boolean;
  } = {},
) {
  const maximumBytes = options.maximumBytes ?? 262144;
  const failures = {
    "400":
      "Malformed JSON, invalid shared input or invalid subject/cursor reference",
    "401": "Missing, invalid or expired actual owner password session",
    "403":
      "Untrusted or missing required Origin, denied authority or inaccessible scope",
    ...(options.notFound !== false
      ? { "404": "Operation or canonical record not found" }
      : {}),
    ...(options.conflict
      ? {
          "409":
            "Expected version or stable record identity conflicts with current canonical state",
        }
      : {}),
    "413": `UTF-8 JSON request body exceeds ${maximumBytes} bytes; INPUT_TOO_LARGE`,
    ...(options.logo
      ? { "502": "GitHub refused the read; LOGO_SOURCE_UNAUTHORIZED" }
      : {}),
    "503": "Canonical service, database or validated result is unavailable",
  };
  const failureContent = (status: string) => {
    const base = jsonContent(
      status === "413" ? "ObservatoryInputTooLarge" : "FoundationFailure",
    );
    if (!options.logo) return base;
    if (status === "502") return jsonContent("ObservatoryLogoFailure");
    if (!["400", "404", "413", "503"].includes(status)) return base;
    return {
      "application/json": {
        schema: {
          oneOf: [
            base["application/json"].schema,
            { $ref: "#/components/schemas/ObservatoryLogoFailure" },
          ],
        },
      },
    };
  };
  return {
    post: {
      operationId,
      tags: ["Observatory"],
      summary,
      description:
        (options.read ? observatoryReadAuthority : observatoryOwnerAuthority) +
        description +
        ` Structural schemas use the canonical shared Zod definitions; server validation also enforces cross-field identities, authority and continuation/version refinements. UTF-8 JSON input is bounded to ${maximumBytes} bytes; this transport bound is not an inventory population cap.`,
      parameters: [
        {
          ...ownerOriginParameter,
          required: !options.read,
          description: options.read
            ? "Nonempty configured application/trusted local Origin is required in password mode. Only the explicit local auth-off read mode permits omission; supplied foreign origins are denied."
            : "Nonempty configured application or trusted local Origin is required for this owner POST, including private-view and Work reads. No auth-off fallback.",
        },
        {
          in: "header",
          name: "X-Correlation-Id",
          required: false,
          description:
            "Optional safe correlation ID; invalid values are replaced by a server UUID",
          schema: observatoryResponseHeaders["X-Correlation-Id"].schema,
        },
      ],
      requestBody: { required: true, content: jsonContent(input) },
      responses: {
        "200": {
          description: "Strict current canonical result; no-store",
          headers: observatoryResponseHeaders,
          content: jsonContent(output),
        },
        ...Object.fromEntries(
          Object.entries(failures).map(([status, failure]) => [
            status,
            {
              description: failure,
              headers: observatoryResponseHeaders,
              content: failureContent(status),
            },
          ]),
        ),
      },
    },
  };
}

const observatoryPaths = {
  "/api/v1/infrastructure/observatory/scene": observatoryPost(
    "readOwnerObservatoryScene",
    "ObservatorySceneQuery",
    "ObservatorySceneReadResult",
    "Read the complete authorized Observatory landscape",
    "Returns the complete canonical resource population, representations, membership index, scopeDigest, projectionRevision and exact per-resource facet access. platformObservations carry each host's latest reported operating system identity (os-release ID, ID_LIKE, PRETTY_NAME and a detected platform such as Proxmox VE) with its observation time and source envelope; they are observations, never roles or mappings, and follow telemetry disclosure. Presentation search/grouping and environment filters never grant authority. Missing or unsupported evidence remains unknown.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/members": observatoryPost(
    "listOwnerObservatoryMembers",
    "ObservatoryMembershipQuery",
    "ObservatoryMembershipPage",
    "Traverse every member of one scene group",
    "The opaque text cursor is bound to groupId, scopeDigest, projectionRevision and the same scene query. Limit 1..100 (default 25) is a page size. Follow every nextCursor to null before claiming the complete population; completeness is partial until the final page. Restart from the scene after INVALID_REFERENCE or changed scope/revision. This cursor is not a provider-feed, private-view or Work cursor.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/relations": observatoryPost(
    "listOwnerObservatoryRelations",
    "ObservatoryRelationsQuery",
    "ObservatoryRelationsResult",
    "Read complete reviewed operational relationships",
    "Returns the complete authorized reviewed relation list, optionally for one resource, without a public cursor or arbitrary truncation. Recorded typed endpoints and provenance do not prove live traffic or inferred topology.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/signals": observatoryPost(
    "readOwnerObservatorySignalEvidence",
    "ObservatorySignalEvidenceQuery",
    "ObservatorySignalEvidenceResult",
    "Read complete selected resource/facet signal evidence",
    "Returns complete safe signals and applicable source/capacity observations for the selected resource and facet, optionally one signalId, with exact access disclosure. There is no public cursor. Preserve original observedAt and freshness; absence is not healthy evidence, and raw originals or credentials are excluded.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/providers": observatoryPost(
    "readOwnerObservatoryProviderExplanation",
    "ObservatoryProviderExplanationQuery",
    "ObservatoryProviderExplanationResult",
    "Read complete selected-resource provider relevance explanations",
    "Returns complete authorized explanations, optionally one noticeId, without a public cursor. Severity, relevance, confidence, causation and confirmed local impact remain distinct; a public incident alone does not prove local impact.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/operational": observatoryPost(
    "readOwnerObservatoryOperationalEvidence",
    "ObservatoryOperationalEvidenceQuery",
    "ObservatoryOperationalEvidenceResult",
    "Read complete persisted operational source evidence",
    "Returns the complete safe source list for availability, pull_requests or security with access, state/error, real observedAt and freshness; no public cursor. Source configuration, immutable raw originals and credentials are excluded. Fixed Commandry readiness is one actual persisted check, not a 25-check history or end-user uptime guarantee; a read cannot freshen old evidence or activate a source.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/catalogue": observatoryPost(
    "readOwnerObservatoryCatalogue",
    "ObservatoryCatalogueQuery",
    "ObservatoryCatalogueResult",
    "Read complete owner reviewed configuration, including sources",
    "Owner catalogue includes annotation, relation, provider and source configuration for the authorized resource. It returns every active/inactive or enabled/disabled record, stable identity, version and literal provenance/evidence, without a public cursor or fixed row cap. Machine catalogue is deliberately narrower and excludes source configuration; this owner HTTP contract does not expand its grants. No raw originals or credentials are returned.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/provider-feed": observatoryPost(
    "listOwnerObservatoryProviderNotices",
    "ObservatoryProviderFeedQuery",
    "ObservatoryProviderFeedResult",
    "Traverse the full recorded public provider notice population",
    "Population is recorded_provider_notices, including complete updates and components. Follow structured nextCursor {afterId,revision,scopeDigest} to null with the same query/scope/feed revision; limit 1..100 (default 50) is a page size. Restart after INVALID_REFERENCE or a changed population revision. This cursor is not opaque membership text or a Work/view UUID cursor. Preserve provider updated/reported time, snapshot read time and last success/attempt separately; unknown/disabled/unavailable/stale differs from a current empty feed.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/reviews/annotation": observatoryPost(
    "reviewOwnerObservatoryAnnotation",
    "ObservatoryAnnotationChange",
    "ObservatoryReviewReceipt",
    "Review a versioned resource annotation and requirement",
    "Reversible owner-only review requires expectedVersion, explicit evidenceRefs and review note; records canonical audit observatory.annotation.review atomically. Operated is an ownership role and does not imply healthy. Stable resource identity is preserved; receipt returns id, accepted version and auditId.",
    { conflict: true },
  ),
  "/api/v1/infrastructure/observatory/reviews/relation": observatoryPost(
    "reviewOwnerObservatoryRelation",
    "ObservatoryRelationChange",
    "ObservatoryReviewReceipt",
    "Review a versioned typed operational relationship",
    "Reversible owner-only review requires expectedVersion, explicit evidenceRefs and review note; records canonical audit observatory.relation.review atomically. Preserve source/target direction, typed canonical endpoints and nullable environment. Set active=false to deactivate without deleting history; do not infer topology from names.",
    { conflict: true },
  ),
  "/api/v1/infrastructure/observatory/reviews/provider": observatoryPost(
    "reviewOwnerObservatoryProviderMapping",
    "ObservatoryProviderMappingChange",
    "ObservatoryReviewReceipt",
    "Review a versioned provider dependency mapping",
    "Reversible owner-only review requires expectedVersion, explicit evidenceRefs and review note; records canonical audit observatory.provider_mapping.review atomically. Map exact stable Cloudflare componentId to dependency.product with explicit control/data plane, nullable geography/environment and canonical provider identity. Set active=false to deactivate; a mapping does not assert live local impact.",
    { conflict: true },
  ),
  "/api/v1/infrastructure/observatory/reviews/source": observatoryPost(
    "reviewOwnerObservatorySource",
    "ObservatorySourceBindingChange",
    "ObservatoryReviewReceipt",
    "Review a versioned operational source configuration",
    "Sensitive owner-only review requires expectedVersion, explicit evidenceRefs and review note; records canonical audit observatory.source.review atomically. Bind an explicit canonical resource/project/environment and reviewed externalId; source kinds are infraagent-monitor, github-repository, http-readiness, endpoint-check, cloudflare-account and namecheap-account. Private provider inventory reads require a separately issued observatory.inventory.read grant and select a fixed server-configured account. Existing provider-status grants remain unchanged. Endpoint checks select an operator-configured ID for the exact resource/environment. Fixed readiness accepts only commandry-web-readiness; arbitrary monitoring targets and credentials are not payload fields. enabled is explicit; enabling schedules server-configured reads, while enabled=false deactivates without deleting evidence. This is not delegated machine authority.",
    { conflict: true },
  ),
  "/api/v1/infrastructure/observatory/reviews/client_scope": observatoryPost(
    "reviewOwnerObservatoryClientScope",
    "ObservatoryClientScopeChange",
    "ObservatoryReviewReceipt",
    "Review a versioned client's explicit Observatory resource scope",
    "Sensitive owner-only review requires expectedVersion, explicit evidenceRefs and review note; records canonical audit observatory.client_scope.review atomically for the existing client/project. An explicit resourceIds list cannot manufacture an owner session, new credential or broader project authority; a bearer client's existing reads do not authorize this mutation.",
    { conflict: true },
  ),
  "/api/v1/infrastructure/observatory/logo": observatoryPost(
    "readOwnerObservatoryLogo",
    "ObservatoryLogoQuery",
    "ObservatoryLogoReadResult",
    "Read one approved resource logo by digest",
    "Returns the stored 128x128 PNG for an authorized resource whose current logo record has the requested digest, as base64 with its version. The scene representation's logo reference supplies the digest; a retired logo remains readable by its digest as history. The resource must be inside the authorized population. MCP get_observatory_resource_logo shares this read.",
    { read: true },
  ),
  "/api/v1/infrastructure/observatory/logo-preview": observatoryPost(
    "previewOwnerObservatoryLogo",
    "ObservatoryLogoPreview",
    "ObservatoryLogoPreviewResult",
    "Preview a repository logo without storing it",
    "Read-only owner operation, audited as observatory.logo.preview. Accepts an upload (base64, at most 524288 bytes before encoding) or an owner-named file in a repository already reviewed for this repository resource, read from api.github.com with the server-held token at the resolved commit. Input is recognised by its bytes (PNG, JPEG, WebP or SVG; SVG with declarations, scripts or outside references is refused) and rasterized to one 128x128 PNG. Returns that PNG, its digest and the source with commit and blob SHAs. Nothing is written. Safe failures: 400 LOGO_UNSUPPORTED_IMAGE or LOGO_REPOSITORY_NOT_REVIEWED, 404 LOGO_SOURCE_NOT_FOUND, 413 LOGO_TOO_LARGE, 502 LOGO_SOURCE_UNAUTHORIZED, 503 LOGO_SOURCE_UNAVAILABLE or LOGO_PROCESSING_UNAVAILABLE.",
    { maximumBytes: 786432, logo: true },
  ),
  "/api/v1/infrastructure/observatory/reviews/logo": observatoryPost(
    "reviewOwnerObservatoryLogo",
    "ObservatoryLogoChange",
    "ObservatoryReviewReceipt",
    "Approve or retire a versioned repository logo",
    "Reversible owner-only review requires expectedVersion, explicit evidenceRefs and review note; records canonical audit observatory.logo.review atomically. Approval resubmits the previewed source (a repository file names the preview's commitSha) with expectedDigest; the server processes it again and returns 409 VERSION_CONFLICT if the result differs from what the owner saw. Only repository resources accept a logo. active=false retires the logo without deleting its image or source, and takes neither input nor digest. Same safe logo failures as preview.",
    { conflict: true, maximumBytes: 786432, logo: true },
  ),
  "/api/v1/infrastructure/observatory/logos/{resourceId}/{digest}": {
    get: {
      operationId: "getOwnerObservatoryLogoImage",
      tags: ["Observatory"],
      summary: "Serve one approved resource logo as an image",
      description:
        observatoryReadAuthority +
        "Same authorized read as POST /api/v1/infrastructure/observatory/logo, for badge image elements. Same-origin only: a cross-site Sec-Fetch-Site is refused. The response is private and immutable because the path names the content digest; it carries nosniff, a restrictive Content-Security-Policy and Cross-Origin-Resource-Policy same-origin.",
      parameters: [
        {
          in: "path",
          name: "resourceId",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
        {
          in: "path",
          name: "digest",
          required: true,
          schema: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
      ],
      responses: {
        "200": {
          description: "The 128x128 PNG",
          headers: {
            "Cache-Control": {
              description: "Digest-addressed content never changes",
              schema: {
                type: "string",
                const: "private, max-age=31536000, immutable",
              },
            },
          },
          content: {
            "image/png": { schema: { type: "string", format: "binary" } },
          },
        },
        ...Object.fromEntries(
          Object.entries({
            "400": "Invalid resource or digest",
            "401": "Missing, invalid or expired actual owner password session",
            "403": "Cross-site request, untrusted Origin or inaccessible scope",
            "404": "No current logo with this digest for the resource",
            "503":
              "Canonical service, database or validated result is unavailable",
          }).map(([status, failure]) => [
            status,
            {
              description: failure,
              headers: observatoryResponseHeaders,
              content: jsonContent("FoundationFailure"),
            },
          ]),
        ),
      },
    },
  },
  "/api/v1/infrastructure/observatory/views/create": observatoryPost(
    "createOwnerObservatoryView",
    "ObservatoryViewCreate",
    "ObservatoryView",
    "Create an owner-private presentation view",
    "Owner-private presentation only, with canonical audit and caller-stable UUID id plus expectedVersion=0. Matching create retries recover the original receipt. Configuration never changes canonical topology, mapping, grants or health. This surface has no delegated sharing or machine mutation capability.",
    { conflict: true },
  ),
  "/api/v1/infrastructure/observatory/views/update": observatoryPost(
    "updateOwnerObservatoryView",
    "ObservatoryViewUpdate",
    "ObservatoryView",
    "Update an owner-private presentation view at its expected version",
    "Owner-private presentation mutation with canonical audit. expectedVersion and projectId are required, including explicit null for a global view; omission must not widen project scope. No shared topology, source or grant is changed.",
    { conflict: true },
  ),
  "/api/v1/infrastructure/observatory/views/delete": observatoryPost(
    "deleteOwnerObservatoryView",
    "ObservatoryViewDelete",
    "ObservatoryViewDeleted",
    "Delete an owner-private presentation view at its expected version",
    "Owner-private audited deletion requires expectedVersion and returns the exact id/version/deleted/updatedAt receipt. No source, resource, operational history or shared canonical mapping is deleted.",
    { conflict: true },
  ),
  "/api/v1/infrastructure/observatory/views/read": observatoryPost(
    "readOwnerObservatoryView",
    "ObservatoryViewRead",
    "ObservatoryView",
    "Read one owner-private canonical presentation view",
    "Low-risk owner-private read, canonically audited as observatory.view.read. Only this owner's view is visible; no delegated sharing capability, raw storage envelope, immutable creation digest or tombstone is exposed. Reading changes no health or canonical mapping.",
  ),
  "/api/v1/infrastructure/observatory/views/page": observatoryPost(
    "pageOwnerObservatoryViews",
    "ObservatoryViewPageQuery",
    "ObservatoryViewPage",
    "Traverse every owner-private canonical presentation view",
    "Low-risk owner-private read, canonically audited as observatory.view.read. Omitted projectId means all this owner's views; projectId=null means global views only; a UUID selects that project. Follow the UUID nextCursor to null to reach the complete matching population; limit 1..100 (default 25) is a page size. This is not an opaque membership cursor or the structured Work/provider-feed cursor. Stored creation digests and tombstones remain private.",
  ),
  "/api/v1/infrastructure/observatory/work/page": observatoryPost(
    "listOwnerObservatoryProjectWork",
    "FoundationProjectWorkQuery",
    "FoundationProjectWorkPage",
    "Traverse complete canonical Work for an authorized owner project",
    "Low-risk owner read, canonically audited as observatory.work.read. Uses the exact Foundation Project Work query and shared canonical serializer: primary project OR active related-project membership, across all types/statuses/assignments/due dates, preserving literal Work and contentDigest. Follow structured {projectId,afterId} nextCursor to null; limit 1..100 (default 25) is a page size and cursor project never grants access. INVALID_REFERENCE requires a restart. consistency=live and selectedAt is actual read time, not a snapshot cutoff or Work updatedAt. Work is not an execution-runtime record; missing actual AgentRun state remains unknown. Original captures and unrelated project context are excluded.",
    { notFound: false },
  ),
};

export function generateOpenApi(): string {
  const document = {
    openapi: "3.1.0",
    info: { title: "Commandry API", version: "v1" },
    paths: {
      ...observatoryPaths,
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
      "/api/v1/local-recovery-status": {
        get: {
          operationId: "getLocalRecoveryStatus",
          summary:
            "Read local restore rehearsal status and unverified production gates",
          responses: {
            "200": {
              description: "Local evidence and production gate status",
              content: jsonContent("LocalRecoveryStatus"),
            },
          },
        },
      },
      "/api/v1/local-recovery-drills": {
        get: {
          operationId: "listLocalRecoveryDrills",
          summary: "Page immutable local restore rehearsal records",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Local restore rehearsal history",
              content: jsonContent("ListLocalRecoveryDrillsResponse"),
            },
          },
        },
      },
      "/api/v1/local-recovery-drills/{id}": {
        get: {
          operationId: "getLocalRecoveryDrill",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "An immutable local restore rehearsal record",
              content: jsonContent("LocalRecoveryDrill"),
            },
            "404": {
              description: "Record not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/local-backups": {
        get: {
          operationId: "listLocalBackups",
          summary: "Page immutable encrypted local backup and restore evidence",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Local-only encrypted backup history",
              content: jsonContent("ListLocalBackupsResponse"),
            },
          },
        },
      },
      "/api/v1/local-backups/{id}": {
        get: {
          operationId: "getLocalBackup",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "An immutable local backup verification record",
              content: jsonContent("LocalBackupEvidence"),
            },
            "404": {
              description: "Record not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/local-release-rehearsals": {
        get: {
          operationId: "listLocalReleaseRehearsals",
          summary:
            "Page immutable isolated local release and code rollback evidence",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Local release rehearsal history",
              content: jsonContent("ListLocalReleaseRehearsalsResponse"),
            },
          },
        },
      },
      "/api/v1/local-release-rehearsals/{id}": {
        get: {
          operationId: "getLocalReleaseRehearsal",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "An immutable local release rehearsal record",
              content: jsonContent("LocalReleaseRehearsal"),
            },
            "404": {
              description: "Record not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/local-release-preflights": {
        get: {
          operationId: "listLocalReleasePreflights",
          summary: "Page immutable local Compose release preflight evidence",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Local release preflight history",
              content: jsonContent("ListLocalReleasePreflightsResponse"),
            },
          },
        },
      },
      "/api/v1/local-release-preflights/{id}": {
        get: {
          operationId: "getLocalReleasePreflight",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "An immutable local release preflight record",
              content: jsonContent("LocalReleasePreflight"),
            },
            "404": {
              description: "Record not found",
              content: jsonContent("ErrorResponse"),
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
      "/api/v1/infrastructure/overview": {
        get: {
          operationId: "getInfrastructureOverview",
          summary:
            "Read a page of canonical resources, real telemetry and typed relationships",
          parameters: [
            {
              in: "query",
              name: "limit",
              schema: { type: "integer", minimum: 1, maximum: 50, default: 12 },
            },
            {
              in: "query",
              name: "cursor",
              schema: { type: "string", format: "uuid" },
            },
            {
              in: "query",
              name: "projectId",
              schema: { type: "string", format: "uuid" },
            },
            {
              in: "query",
              name: "q",
              schema: { type: "string", maxLength: 160 },
            },
          ],
          responses: {
            "200": {
              description: "A consistent, source-backed infrastructure page",
              content: jsonContent("InfrastructureOverview"),
            },
            "400": {
              description: "Invalid scope or cursor",
              content: jsonContent("ErrorResponse"),
            },
            "503": {
              description: "Overview unavailable",
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
      "/api/v1/resources/{id}/impact": {
        get: {
          operationId: "getResourceImpact",
          summary:
            "Page potential downstream impact from recorded local dependencies and synthetic attention",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description:
                "Bounded dependency paths, supporting projects, and latest active synthetic metric drop",
              content: jsonContent("ResourceImpactResponse"),
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
        patch: {
          operationId: "updateProject",
          summary: "Revise project metadata with optimistic version and audit",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("UpdateProjectRequest"),
          },
          responses: {
            "200": {
              description: "Updated project or unchanged current version",
              content: jsonContent("ProjectSummary"),
            },
            "400": {
              description: "Invalid project revision",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Project version changed",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/changes": {
        get: {
          operationId: "listProjectMetadataEvents",
          summary: "Page through immutable project metadata revisions",
          parameters: [
            idParameter,
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
              name: "beforeVersion",
              required: false,
              schema: { type: "integer", minimum: 2 },
            },
          ],
          responses: {
            "200": {
              description: "Project change history, newest version first",
              content: jsonContent("ListProjectMetadataEventsResponse"),
            },
            "400": {
              description: "Invalid page query",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/changes/{version}": {
        get: {
          operationId: "getProjectMetadataEvent",
          summary: "Read one immutable project revision by version",
          parameters: [
            idParameter,
            {
              in: "path",
              name: "version",
              required: true,
              schema: { type: "integer", minimum: 2 },
            },
          ],
          responses: {
            "200": {
              description: "Exact project revision",
              content: jsonContent("ProjectMetadataEvent"),
            },
            "400": {
              description: "Invalid project or version",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Project revision not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/presentation": {
        get: {
          operationId: "getProjectPresentation",
          summary:
            "Read project overview and area settings or provisional defaults",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Current project presentation",
              content: jsonContent("ProjectPresentation"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        patch: {
          operationId: "updateProjectPresentation",
          summary: "Reorder overview cards and show or hide project areas",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("UpdateProjectPresentationRequest"),
          },
          responses: {
            "200": {
              description: "Current project presentation",
              content: jsonContent("ProjectPresentation"),
            },
            "400": {
              description: "Invalid view settings",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Presentation version changed",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/presentation/changes": {
        get: {
          operationId: "listProjectPresentationEvents",
          summary: "Page through immutable project view changes",
          parameters: [
            idParameter,
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
              name: "beforeVersion",
              required: false,
              schema: { type: "integer", minimum: 2 },
            },
          ],
          responses: {
            "200": {
              description: "View changes newest first",
              content: jsonContent("ListProjectPresentationEventsResponse"),
            },
            "400": {
              description: "Invalid page query",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/presentation/changes/{version}": {
        get: {
          operationId: "getProjectPresentationEvent",
          summary: "Read an exact immutable project view change",
          parameters: [
            idParameter,
            {
              in: "path",
              name: "version",
              required: true,
              schema: { type: "integer", minimum: 2 },
            },
          ],
          responses: {
            "200": {
              description: "Exact project view change",
              content: jsonContent("ProjectPresentationEvent"),
            },
            "400": {
              description: "Invalid project or version",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "View change not found",
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
      "/api/v1/projects/{id}/flow": {
        get: {
          operationId: "listProjectFlow",
          summary:
            "Page a historical local project flow across stored relationships and runs",
          parameters: [
            idParameter,
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
            {
              name: "cursor",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Evidence-linked historical local project flow page",
              content: jsonContent("ListProjectFlowResponse"),
            },
            "400": {
              description: "Invalid flow cursor or page",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Project not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/projects/{id}/agent-findings": {
        get: {
          operationId: "listProjectAgentFindings",
          summary:
            "Page saved synthetic unverified fake-agent findings for one project",
          parameters: [
            idParameter,
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 50 },
            },
            {
              name: "cursor",
              in: "query",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description:
                "Project-scoped saved fake-agent results with exact evidence",
              content: jsonContent("ListProjectAgentFindingsResponse"),
            },
            "400": {
              description: "Invalid project or page cursor",
              content: jsonContent("ErrorResponse"),
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
      "/api/v1/captures/{id}/preview-image": {
        get: {
          operationId: "previewOriginalImage",
          summary:
            "Preview verified local PNG, JPEG, WebP, or GIF bytes without changing the original",
          parameters: [idParameter],
          responses: {
            "200": {
              description:
                "Verified raster image bytes with no-store and checksum headers",
              content: Object.fromEntries(
                ["image/png", "image/jpeg", "image/webp", "image/gif"].map(
                  (mediaType) => [
                    mediaType,
                    { schema: { type: "string", format: "binary" } },
                  ],
                ),
              ),
            },
            "404": {
              description: "Original file not found",
              content: jsonContent("ErrorResponse"),
            },
            "415": {
              description: "Original is not a supported matching raster image",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/captures/{id}/derived-text": {
        get: {
          operationId: "getLocalFileDerivedText",
          summary:
            "Read the labeled local UTF-8 projection, separate from original file bytes",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "File extraction status and derived text",
              content: jsonContent("LocalFileTextProjection"),
            },
            "404": {
              description: "File text projection not found",
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
            {
              in: "query",
              name: "priority",
              required: false,
              schema: {
                type: "string",
                enum: ["low", "normal", "high", "unset"],
              },
            },
            {
              in: "query",
              name: "assignee",
              required: false,
              schema: {
                type: "string",
                enum: ["unassigned", "local_user", "agent"],
              },
            },
            {
              in: "query",
              name: "due",
              required: false,
              schema: {
                type: "string",
                enum: ["overdue", "today", "upcoming", "undated"],
              },
            },
            {
              in: "query",
              name: "asOf",
              required: false,
              description: "UTC date anchoring the due bucket across pages",
              schema: { type: "string", format: "date" },
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
      "/api/v1/execution-packets/{id}/agent-routing": {
        get: {
          operationId: "listPacketLocalAgentRouting",
          summary: "Explain manual synthetic local agent choices for a packet",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description:
                "Project-scoped candidates with active fake-run load",
              content: jsonContent("LocalAgentRoutingResponse"),
            },
            "404": {
              description: "Packet not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/execution-packets/{id}/cached-local-result": {
        get: {
          operationId: "getCachedLocalAgentResult",
          summary: "Page saved evidence from the latest exact-packet fake run",
          parameters: [
            idParameter,
            {
              name: "agentId",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
            {
              name: "cursor",
              in: "query",
              schema: { type: "integer", minimum: 0 },
            },
          ],
          responses: {
            "200": {
              description: "Historical unverified result or empty cache",
              content: jsonContent("CachedLocalAgentResultResponse"),
            },
            "403": {
              description: "Agent is not currently assigned to packet project",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Packet not found",
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
      "/api/v1/agent-runs/{id}/cancel": {
        post: {
          operationId: "cancelLocalAgentRun",
          summary: "Cancel a queued or running synthetic local run",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Current run, canceled if it was still active",
              content: jsonContent("LocalAgentRun"),
            },
            "404": {
              description: "Run not found",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/agent-runs/{id}/callbacks": {
        get: {
          operationId: "listLocalAgentCallbacks",
          summary:
            "Page labeled synthetic local runner heartbeats and artifacts",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Immutable local runner callback events",
              content: jsonContent("ListLocalAgentCallbacksResponse"),
            },
          },
        },
        post: {
          operationId: "reportLocalAgentCallback",
          summary: "Report a scoped local-only runner heartbeat or artifact",
          parameters: [idParameter],
          security: [{ localRunnerBearer: [] }],
          requestBody: {
            required: true,
            content: jsonContent("LocalAgentCallbackRequest"),
          },
          responses: {
            "201": {
              description: "Accepted immutable callback event",
              content: jsonContent("LocalAgentCallbackEvent"),
            },
            "403": {
              description: "Callback token, scope, or lease rejected",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Callback sequence already used or out of order",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/agent-runs/{id}/callbacks/{eventId}/artifact": {
        get: {
          operationId: "downloadLocalAgentCallbackArtifact",
          summary: "Download one bounded synthetic local runner report",
          parameters: [
            idParameter,
            {
              in: "path",
              name: "eventId",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Stored synthetic JSON report as an attachment",
              content: {
                "application/json": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            "404": {
              description: "Artifact not found for this run",
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
      "/api/v1/saved-views": {
        get: {
          operationId: "listSavedViews",
          summary: "Page through active local saved Work or Knowledge queries",
          parameters: [
            ...pageParameters,
            {
              in: "query",
              name: "surface",
              required: true,
              schema: { type: "string", enum: ["work", "knowledge"] },
            },
          ],
          responses: {
            "200": {
              description: "Saved view page",
              content: jsonContent("ListSavedViewsResponse"),
            },
          },
        },
        post: {
          operationId: "createSavedView",
          summary: "Save the current local query definition",
          requestBody: {
            required: true,
            content: jsonContent("CreateSavedViewRequest"),
          },
          responses: {
            "201": {
              description: "Created saved view",
              content: jsonContent("SavedView"),
            },
          },
        },
      },
      "/api/v1/saved-views/{id}": {
        get: {
          operationId: "getSavedView",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Current saved query definition",
              content: jsonContent("SavedView"),
            },
          },
        },
        patch: {
          operationId: "updateSavedView",
          summary: "Replace a saved query with optimistic version checking",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("UpdateSavedViewRequest"),
          },
          responses: {
            "200": {
              description: "Updated saved view",
              content: jsonContent("SavedView"),
            },
            "409": {
              description: "Saved view version changed",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/saved-views/{id}/archive": {
        post: {
          operationId: "archiveSavedView",
          summary:
            "Remove a saved view from active choices while keeping audit",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("ArchiveSavedViewRequest"),
          },
          responses: {
            "200": {
              description: "Archived saved view",
              content: jsonContent("SavedView"),
            },
          },
        },
      },
      "/api/v1/saved-views/{id}/audit": {
        get: {
          operationId: "listSavedViewAudit",
          summary: "Page through local saved view changes",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Saved view change history",
              content: jsonContent("ListSavedViewAuditResponse"),
            },
          },
        },
      },
      "/api/v1/knowledge-items": {
        get: {
          operationId: "listWorkspaceKnowledge",
          summary: "Page through source-linked notes across projects",
          parameters: [
            ...pageParameters,
            projectFilterParameter,
            {
              in: "query",
              name: "kind",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "note",
                  "idea",
                  "research",
                  "requirement",
                  "architecture_note",
                  "runbook",
                  "meeting_note",
                  "lesson_learned",
                  "instruction",
                  "link",
                  "document",
                ],
              },
            },
          ],
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
      "/api/v1/automations/{id}/export": {
        get: {
          operationId: "exportLocalAutomationPage",
          summary:
            "Page through a portable local-only definition and synthetic run export",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Portable automation export page",
              content: jsonContent("AutomationExportPage"),
            },
            "404": {
              description: "Automation not found",
              content: jsonContent("ErrorResponse"),
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
      "/api/v1/automation-runs/{id}/evidence-checks": {
        get: {
          operationId: "listAutomationEvidenceChecks",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Local evidence presence check history",
              content: jsonContent("ListAutomationEvidenceChecksResponse"),
            },
          },
        },
        post: {
          operationId: "checkAutomationEvidencePresence",
          summary:
            "Record presence of referenced local evidence without verifying external effects",
          parameters: [idParameter],
          responses: {
            "201": {
              description: "Recorded evidence presence check",
              content: jsonContent("AutomationEvidenceCheck"),
            },
            "409": {
              description: "Run has no completed result",
              content: jsonContent("ErrorResponse"),
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
      "/api/v1/foundation/workflows/improvements": workflowRead(
        "listOwnerImprovements",
        "FoundationImprovementPage",
        "page",
        "List all configuration improvement proposals in the project",
      ),
      "/api/v1/foundation/workflows/improvements/{id}": workflowRead(
        "getOwnerImprovement",
        "FoundationImprovementDetail",
        "id",
        "Read exact proposal and complete current regression advisory",
      ),
      "/api/v1/foundation/workflows/improvements/review": workflowWrite(
        "reviewOwnerImprovement",
        "FoundationImprovementDecisionInput",
        "FoundationImprovementDecisionMutation",
        "Record an expiring owner decision bound to the exact current comparison. Does not adopt or install configurations. JSON body limit 131072 bytes. Exact decision retry also requires an unexpired input deadline.",
      ),
      "/api/v1/foundation/workflows/findings/by-capture/{captureId}":
        workflowRead(
          "getOwnerFindingByCapture",
          "FoundationFindingProposalDetail",
          "capture",
          "Read canonical cited finding and its immutable original by Capture",
        ),
      "/api/v1/foundation/workflows/findings/{id}": workflowRead(
        "getOwnerFinding",
        "FoundationFindingProposalDetail",
        "id",
        "Read canonical cited finding by proposal identity",
      ),
      "/api/v1/foundation/workflows/findings/review": workflowWrite(
        "reviewOwnerFinding",
        "FoundationFindingProposalReviewInput",
        "FoundationFindingProposalReviewMutation",
        "Approve selected finding words into canonical Knowledge and a proposed unverified assertion, or reject without filing. Assertion acceptance, verification and instruction approval remain separate. JSON body limit 524288 bytes.",
      ),
      "/api/v1/foundation/workflows/onboarding": workflowRead(
        "listOwnerOnboardings",
        "FoundationOnboardingPage",
        "page",
        "List all reviewed host onboarding intentions in the project",
      ),
      "/api/v1/foundation/workflows/onboarding/{id}": workflowRead(
        "getOwnerOnboarding",
        "FoundationOnboardingDetail",
        "id",
        "Read the owner's full onboarding proposal, decision and outcome",
      ),
      "/api/v1/foundation/workflows/onboarding/{id}/preview": workflowRead(
        "previewOwnerOnboarding",
        "FoundationOnboardingPreview",
        "id",
        "Inspect exact current host, connection, asserted identity and apply blockers",
      ),
      "/api/v1/foundation/workflows/onboarding/review": workflowWrite(
        "reviewOwnerOnboarding",
        "FoundationOnboardingReviewInput",
        "FoundationOnboardingDecisionMutation",
        "Record an expiring inventory decision tied to a current preview and explicit inventory review acknowledgement. Apply remains separate. JSON body limit 131072 bytes. Exact historical retries may recover after decision expiry.",
      ),
      "/api/v1/foundation/workflows/onboarding/apply": workflowWrite(
        "applyOwnerOnboarding",
        "FoundationOnboardingApplyInput",
        "FoundationOnboardingOutcomeMutation",
        "Apply the exact current unexpired approval to canonical local host inventory and project connection atomically. No rename, reparent, archived reactivation, SSH, provisioning or collector deployment. JSON body limit 131072 bytes. Historical retries return the original outcome without repeating effects.",
      ),
      "/api/v1/foundation/task-proposals/by-capture/{captureId}": {
        get: {
          operationId: "getOwnerTaskProposal",
          summary:
            "Live owner reads an actual-client task proposal and immutable original",
          description:
            "Requires a live owner password session in this environment. Exact project/capture selector, strict query with no duplicate keys, no-store response. Machine credentials grant no raw read or review authority. Text and references remain unverified data.",
          parameters: [
            {
              in: "path",
              name: "captureId",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              in: "query",
              name: "projectId",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description:
                "Validated immutable source, suggestion and current terminal decision if any",
              content: jsonContent("FoundationTaskProposalDetail"),
            },
            "400": {
              description: "Invalid strict selector",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner password session required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Origin or authority denied",
              content: jsonContent("FoundationFailure"),
            },
            "404": {
              description: "No proposal in this project/environment",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Unavailable or invalid persisted output",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/foundation/task-proposals/review": {
        post: {
          operationId: "reviewOwnerTaskProposal",
          summary:
            "Owner approves selected text into one canonical task or rejects the proposal",
          description:
            "Live owner password session and trusted Origin required. work.proposal.review is sensitive and owner-only, audited and bound to immutable source/proposal digests and expected version. JSON physical body is limited to 524288 bytes. Approval atomically creates canonical unassigned open Work; rejection preserves the unfiled original. Retry the exact input and Idempotency-Key after an uncertain response. Historical receipts retain the original result after later Work edits. No source verification, assignment, execution or instruction promotion.",
          parameters: [
            {
              in: "header",
              name: "Origin",
              required: true,
              schema: { type: "string", format: "uri" },
            },
            {
              in: "header",
              name: "Idempotency-Key",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 200 },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent("FoundationTaskProposalReviewInput"),
          },
          responses: {
            "200": {
              description:
                "Validated historical initial canonical Work or terminal rejection receipt",
              content: jsonContent("FoundationTaskProposalReviewMutation"),
            },
            "400": {
              description: "Invalid strict input or key",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner password session required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Trusted Origin or owner authority denied",
              content: jsonContent("FoundationFailure"),
            },
            "404": {
              description: "No proposal in this scope",
              content: jsonContent("FoundationFailure"),
            },
            "409": {
              description:
                "Digest, version, terminal decision or idempotency conflict",
              content: jsonContent("FoundationFailure"),
            },
            "413": {
              description: "Physical JSON request exceeds the byte budget",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["code"],
                    properties: {
                      code: { type: "string", const: "PAYLOAD_TOO_LARGE" },
                    },
                  },
                },
              },
            },
            "503": {
              description: "Unavailable; retry the exact input and key",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/foundation/imports/preview": {
        post: {
          operationId: "previewSelectedMemoryImport",
          summary:
            "Live owner previews an explicitly supplied closed memory export without writes",
          description:
            "Requires an owner password session and trusted Origin. Physical JSON and canonical application input each have an 8 MiB bound, with at most 1000 records and 1000 aggregate sources. Original text is not fetched from supplied paths. No machine access or instruction approval.",
          parameters: [
            {
              in: "header",
              name: "Origin",
              required: true,
              description:
                "Configured trusted application Origin for owner mutations",
              schema: {
                type: "string",
                format: "uri",
                minLength: 1,
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MnemosyneImportEnvelope",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Complete scoped result; no inferred approval",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/MnemosyneImportPlan",
                  },
                },
              },
            },
            "400": {
              description: "Strict input or reference denied",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "401": {
              description:
                "Live owner sign-in required. Apply may have committed before expiry; preserve the exact input and key for manual retry.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "403": {
              description: "Owner scope or trusted Origin denied",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "404": {
              description: "Scoped import revision not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "409": {
              description:
                "Changed head, destination, version or idempotency input; review a fresh preview",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "503": {
              description:
                "Unavailable or invalid output. Apply outcome may be unknown; preserve exact input and key.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "413": {
              description:
                "Physical JSON request exceeds 8 MiB, rejected before mutation. Split whole records and preview a smaller export.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["code"],
                    properties: {
                      code: {
                        type: "string",
                        const: "PAYLOAD_TOO_LARGE",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/foundation/imports/apply": {
        post: {
          operationId: "applySelectedMemoryImport",
          summary:
            "Owner reviews all selected records and imports proposed, unverified memory",
          description:
            "Sensitive owner-only memory.import. Requires exact individual review in every tier, current expected heads, destination binding and a live session. Atomically preserves immutable UTF8 originals, evidence, versions, receipt and audit. No instruction approval or overwrite of owner edits. Exact input/key replays the historical receipt. The complete reviewed wrapper must fit 8 MiB, not merely its preview envelope.",
          parameters: [
            {
              in: "header",
              name: "Origin",
              required: true,
              description:
                "Configured trusted application Origin for owner mutations",
              schema: {
                type: "string",
                format: "uri",
                minLength: 1,
              },
            },
            {
              in: "header",
              name: "Idempotency-Key",
              required: true,
              schema: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FoundationSelectedImportInput",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Complete scoped result; no inferred approval",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationSelectedImportResult",
                  },
                },
              },
            },
            "400": {
              description: "Strict input or reference denied",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "401": {
              description:
                "Live owner sign-in required. Apply may have committed before expiry; preserve the exact input and key for manual retry.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "403": {
              description: "Owner scope or trusted Origin denied",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "404": {
              description: "Scoped import revision not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "409": {
              description:
                "Changed head, destination, version or idempotency input; review a fresh preview",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "503": {
              description:
                "Unavailable or invalid output. Apply outcome may be unknown; preserve exact input and key.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "413": {
              description:
                "Physical JSON request exceeds 8 MiB, rejected before mutation. Split whole records and preview a smaller export.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["code"],
                    properties: {
                      code: {
                        type: "string",
                        const: "PAYLOAD_TOO_LARGE",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/foundation/imports/{id}": {
        get: {
          operationId: "getSelectedMemoryImportRevision",
          summary: "Owner-only immutable revision metadata, without originals",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: {
                type: "string",
                format: "uuid",
              },
            },
            {
              in: "query",
              name: "projectId",
              required: true,
              schema: {
                type: "string",
                format: "uuid",
              },
            },
          ],
          responses: {
            "200": {
              description: "Complete scoped result; no inferred approval",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationImportRevision",
                  },
                },
              },
            },
            "400": {
              description: "Strict input or reference denied",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "401": {
              description:
                "Live owner sign-in required. Apply may have committed before expiry; preserve the exact input and key for manual retry.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "403": {
              description: "Owner scope or trusted Origin denied",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "404": {
              description: "Scoped import revision not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "409": {
              description:
                "Changed head, destination, version or idempotency input; review a fresh preview",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "503": {
              description:
                "Unavailable or invalid output. Apply outcome may be unknown; preserve exact input and key.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/foundation/imports/{id}/sources": {
        get: {
          operationId: "listSelectedMemoryImportOriginals",
          summary:
            "Owner-only complete ordinal pagination of preserved originals",
          description:
            "Revision and project checked on every page. fromOrdinal is inclusive; nextOrdinal is the next request boundary, null only at exhaustion. Derived response size may exceed the request budget. Content is preserved, never executed. Machine grants do not disclose these originals.",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: {
                type: "string",
                format: "uuid",
              },
            },
            {
              in: "query",
              name: "projectId",
              required: true,
              schema: {
                type: "string",
                format: "uuid",
              },
            },
            {
              in: "query",
              name: "fromOrdinal",
              schema: {
                type: "integer",
                minimum: 0,
                maximum: 1000,
                default: 0,
              },
            },
            {
              in: "query",
              name: "limit",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 1000,
                default: 100,
              },
            },
          ],
          responses: {
            "200": {
              description: "Complete scoped result; no inferred approval",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationImportOriginalPage",
                  },
                },
              },
            },
            "400": {
              description: "Strict input or reference denied",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "401": {
              description:
                "Live owner sign-in required. Apply may have committed before expiry; preserve the exact input and key for manual retry.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "403": {
              description: "Owner scope or trusted Origin denied",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "404": {
              description: "Scoped import revision not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "409": {
              description:
                "Changed head, destination, version or idempotency input; review a fresh preview",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
            "503": {
              description:
                "Unavailable or invalid output. Apply outcome may be unknown; preserve exact input and key.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/FoundationFailure",
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/foundation/clients": {
        get: {
          operationId: "listFoundationClients",
          summary:
            "Owner-only project and environment credential metadata; no secrets",
          parameters: [
            {
              in: "query",
              name: "projectId",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              in: "query",
              name: "limit",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 100,
                default: 25,
              },
            },
            {
              in: "query",
              name: "after",
              schema: { type: "string", format: "uuid" },
            },
            {
              in: "query",
              name: "asOf",
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: {
            "200": {
              description: "Complete reachable page with creation cutoff",
              content: jsonContent("FoundationClientList"),
            },
            "400": {
              description: "Strict input or reference denied",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner sign-in required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Origin or operation denied",
              content: jsonContent("FoundationFailure"),
            },
            "409": {
              description: "Version or idempotency conflict",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Unavailable; do not infer success",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
        post: {
          operationId: "createFoundationClient",
          summary:
            "Owner-only opt-in capability credential shown once; no inferred grants",
          parameters: [
            ownerOriginParameter,
            {
              in: "header",
              name: "Idempotency-Key",
              required: true,
              schema: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
              },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent("FoundationCreateClient"),
          },
          responses: {
            "201": {
              description:
                "Credential shown once. Retry cannot reveal it again; list/revoke and issue with a new key if response lost.",
              content: jsonContent("FoundationIssuedClient"),
            },
            "400": {
              description: "Strict input or reference denied",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner sign-in required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Origin or operation denied",
              content: jsonContent("FoundationFailure"),
            },
            "409": {
              description: "Version or idempotency conflict",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Unavailable; do not infer success",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/foundation/clients/{id}/revoke": {
        post: {
          operationId: "revokeFoundationClient",
          summary:
            "Live owner session revokes exact credential; cannot widen grants",
          parameters: [ownerOriginParameter, idParameter],
          responses: {
            "200": {
              description: "Revoked public metadata",
              content: jsonContent("FoundationClient"),
            },
            "400": {
              description: "Strict input or reference denied",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner sign-in required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Origin or operation denied",
              content: jsonContent("FoundationFailure"),
            },
            "409": {
              description: "Version or idempotency conflict",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Unavailable; do not infer success",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/foundation/evaluations/assessments/review": {
        post: {
          operationId: "reviewFoundationAssessment",
          summary:
            "Owner-only append of an exact assessment review; no score changes or promotion",
          parameters: [
            ownerOriginParameter,
            {
              in: "header",
              name: "Idempotency-Key",
              required: true,
              schema: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
              },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent("FoundationAssessment"),
          },
          responses: {
            "200": {
              description: "Immutable next-version reviewed assessment receipt",
              content: jsonContent("FoundationAssessmentMutation"),
            },
            "400": {
              description: "Strict input or reference denied",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner sign-in required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Origin or operation denied",
              content: jsonContent("FoundationFailure"),
            },
            "404": {
              description: "Scoped assessment reference unavailable",
              content: jsonContent("FoundationFailure"),
            },
            "409": {
              description: "Version or idempotency conflict",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Unavailable; do not infer success",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/foundation/memory/{id}": {
        get: {
          operationId: "getOwnerFoundationMemory",
          summary:
            "Owner-only exact assertion and source anchor; review is separate from verification and instruction approval",
          parameters: [
            idParameter,
            {
              in: "query",
              name: "projectId",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description:
                "Current canonical assertion with historical source anchor and freshness",
              content: jsonContent("FoundationOwnerMemoryRead"),
            },
            "400": {
              description: "Strict singleton project selector required",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner sign-in required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Owner or origin denied",
              content: jsonContent("FoundationFailure"),
            },
            "404": {
              description: "Scoped assertion unavailable",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Read unavailable; no assertion delivered",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/foundation/memory/{id}/review": {
        post: {
          operationId: "reviewFoundationMemory",
          summary:
            "Sensitive owner-only exact-version action; separate review, verification and instruction approval",
          parameters: [
            ownerOriginParameter,
            idParameter,
            {
              in: "header",
              name: "Idempotency-Key",
              required: true,
              schema: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
              },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent("FoundationReviewMemoryBody"),
          },
          responses: {
            "200": {
              description:
                "Atomic original-result receipt; no instruction execution",
              content: jsonContent("FoundationMemoryMutation"),
            },
            "400": {
              description: "Strict input or reference denied",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner sign-in required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Origin or operation denied",
              content: jsonContent("FoundationFailure"),
            },
            "409": {
              description: "Version or idempotency conflict",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Unavailable; do not infer success",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/foundation/memory/{id}/verify": {
        post: {
          operationId: "verifyFoundationMemory",
          summary:
            "Sensitive owner-only exact-version action; separate review, verification and instruction approval",
          parameters: [
            ownerOriginParameter,
            idParameter,
            {
              in: "header",
              name: "Idempotency-Key",
              required: true,
              schema: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
              },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent("FoundationVerifyMemoryBody"),
          },
          responses: {
            "200": {
              description:
                "Atomic original-result receipt; no instruction execution",
              content: jsonContent("FoundationMemoryMutation"),
            },
            "400": {
              description: "Strict input or reference denied",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner sign-in required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Origin or operation denied",
              content: jsonContent("FoundationFailure"),
            },
            "409": {
              description: "Version or idempotency conflict",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Unavailable; do not infer success",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/foundation/memory/{id}/approve-instruction": {
        post: {
          operationId: "approveFoundationInstruction",
          summary:
            "Sensitive owner-only exact-version action; separate review, verification and instruction approval",
          parameters: [
            ownerOriginParameter,
            idParameter,
            {
              in: "header",
              name: "Idempotency-Key",
              required: true,
              schema: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
              },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent("FoundationApproveInstructionBody"),
          },
          responses: {
            "200": {
              description:
                "Atomic original-result receipt; no instruction execution",
              content: jsonContent("FoundationInstructionMutation"),
            },
            "400": {
              description: "Strict input or reference denied",
              content: jsonContent("FoundationFailure"),
            },
            "401": {
              description: "Live owner sign-in required",
              content: jsonContent("FoundationFailure"),
            },
            "403": {
              description: "Origin or operation denied",
              content: jsonContent("FoundationFailure"),
            },
            "409": {
              description: "Version or idempotency conflict",
              content: jsonContent("FoundationFailure"),
            },
            "503": {
              description: "Unavailable; do not infer success",
              content: jsonContent("FoundationFailure"),
            },
          },
        },
      },
      "/api/v1/knowledge-clients": {
        get: {
          operationId: "listKnowledgeClients",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Owner-only credential metadata; no tokens",
              content: jsonContent("ListKnowledgeClients"),
            },
            "401": {
              description: "Owner sign-in required",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
        post: {
          operationId: "createKnowledgeClient",
          requestBody: {
            required: true,
            content: jsonContent("CreateKnowledgeClient"),
          },
          responses: {
            "201": {
              description: "Owner-approved project read credential, shown once",
              content: jsonContent("CreatedKnowledgeClient"),
            },
            "401": {
              description: "Owner sign-in required",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/knowledge-clients/{id}/revoke": {
        post: {
          operationId: "revokeKnowledgeClient",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Owner revoked credential",
              content: jsonContent("KnowledgeClient"),
            },
            "401": {
              description: "Owner sign-in required",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/real-integrations": {
        get: {
          operationId: "listRealIntegrations",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Real source page",
              content: jsonContent("ListRealIntegrationsResponse"),
            },
          },
        },
        post: {
          operationId: "createRealIntegration",
          requestBody: {
            required: true,
            content: jsonContent("CreateRealIntegrationRequest"),
          },
          responses: {
            "201": {
              description: "Owner configured read-only source",
              content: jsonContent("RealIntegration"),
            },
            "401": {
              description: "Owner authentication required",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Project/resource binding rejected",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/real-integrations/{id}": {
        get: {
          operationId: "getRealIntegration",
          parameters: [idParameter],
          responses: {
            "200": {
              description: "Real source status",
              content: jsonContent("RealIntegration"),
            },
          },
        },
        put: {
          operationId: "setRealIntegrationEnabled",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SetRealIntegrationEnabledRequest"),
          },
          responses: {
            "200": {
              description: "Source state",
              content: jsonContent("RealIntegration"),
            },
          },
        },
      },
      "/api/v1/real-integrations/{id}/token": {
        post: {
          operationId: "rotateRealHostToken",
          parameters: [idParameter],
          responses: {
            "201": {
              description: "Scoped host token, shown once",
              content: jsonContent("RealReceiverToken"),
            },
          },
        },
      },
      "/api/v1/real-integrations/{id}/receive": {
        post: {
          operationId: "receiveRealHostSample",
          summary: "Token-scoped, bounded Linux host ingestion",
          description:
            "Accepts one strict host sample. The optional os object reports os-release identity and a platform detected from local tooling; collectors omit it when os-release is unreadable. Unknown keys are rejected, so the receiver must accept a field before collectors send it.",
          parameters: [
            idParameter,
            {
              name: "Authorization",
              in: "header",
              required: true,
              schema: { type: "string" },
              description: "Bearer token issued for this host integration",
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent("LinuxHostSample"),
          },
          responses: {
            "202": { description: "Persisted host observation" },
            "401": {
              description: "Invalid scoped token",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Disabled, unlinked or conflicting source",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/real-integrations/{id}/observations": {
        get: {
          operationId: "listRealSourceObservations",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Evidence-linked observations and metrics",
              content: jsonContent("ListRealObservationsResponse"),
            },
          },
        },
      },
      "/api/v1/integrations": {
        get: {
          operationId: "listLocalIntegrations",
          summary: "Page through configured local fixture sources",
          parameters: [
            ...pageParameters,
            projectFilterParameter,
            resourceFilterParameter,
          ],
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
      "/api/v1/integrations/{id}/freshness": {
        put: {
          operationId: "setLocalIntegrationFreshnessWindow",
          summary: "Set the local synthetic observation freshness window",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SetLocalIntegrationFreshnessRequest"),
          },
          responses: {
            "200": {
              description: "Source with recalculated observation freshness",
              content: jsonContent("LocalIntegration"),
            },
            "403": {
              description: "Local-only endpoint unavailable",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/integrations/{id}/receiver-token": {
        post: {
          operationId: "rotateLocalSyntheticReceiverToken",
          summary:
            "Mint a one-time local synthetic receiver token; store only its digest",
          parameters: [idParameter],
          responses: {
            "201": {
              description: "Local receiver token shown once",
              content: jsonContent("LocalConnectorToken"),
            },
            "403": {
              description: "Local-only endpoint unavailable",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/integrations/{id}/receive": {
        post: {
          operationId: "receiveLocalSyntheticEnvelope",
          summary:
            "Receive a token-protected synthetic fixture envelope in local mode",
          parameters: [idParameter],
          security: [{ localSyntheticBearer: [] }],
          requestBody: {
            required: true,
            content: jsonContent("RunLocalIntegrationSampleRequest"),
          },
          responses: {
            "202": {
              description: "Synthetic import receipt",
              content: jsonContent("SyntheticEventImport"),
            },
            "401": {
              description: "Invalid local receiver token",
              content: jsonContent("ErrorResponse"),
            },
            "403": {
              description: "Local-only endpoint unavailable",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/integrations/{id}/poll-feed": {
        get: {
          operationId: "listLocalSyntheticPollFeed",
          summary:
            "Page through queued synthetic fixture rows and worker outcomes",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Synthetic poll feed",
              content: jsonContent("ListLocalConnectorFeedResponse"),
            },
          },
        },
        post: {
          operationId: "queueLocalSyntheticPollFeed",
          summary: "Queue a synthetic fixture row for local worker polling",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("RunLocalIntegrationSampleRequest"),
          },
          responses: {
            "202": {
              description: "Queued synthetic feed row",
              content: jsonContent("LocalConnectorFeedItem"),
            },
            "403": {
              description: "Local-only endpoint unavailable",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/synthetic-event-imports": {
        get: {
          operationId: "listSyntheticEventImports",
          summary: "Page through locally submitted synthetic imports",
          parameters: [
            ...pageParameters,
            {
              name: "integrationInstanceId",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
          ],
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
      "/api/v1/synthetic-event-imports/{id}/replay": {
        get: {
          operationId: "getSyntheticFlowReplay",
          summary: "Replay one persisted synthetic import correlation chain",
          parameters: [idParameter, ...pageParameters],
          responses: {
            "200": {
              description: "Historical replay with exact linked records",
              content: jsonContent("SyntheticFlowReplay"),
            },
            "400": {
              description: "Invalid query or replay cursor",
              content: jsonContent("ErrorResponse"),
            },
            "403": {
              description: "Replay is local and test only",
              content: jsonContent("ErrorResponse"),
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
          summary: "Page through explicitly labeled normalized activity",
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
              description: "Immutable original source evidence",
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
      "/api/v1/attention-signals": {
        get: {
          operationId: "listLocalAttentionSignals",
          summary: "Page evidence-linked synthetic freshness and metric trends",
          parameters: [
            ...pageParameters,
            projectFilterParameter,
            resourceFilterParameter,
            {
              name: "view",
              in: "query",
              schema: { type: "string", enum: ["active", "all"] },
            },
          ],
          responses: {
            "200": {
              description:
                "Local attention signal page; real health remains unknown",
              content: jsonContent("ListLocalAttentionSignalsResponse"),
            },
          },
        },
      },
      "/api/v1/attention-signals/{id}/review": {
        post: {
          operationId: "reviewLocalAttentionSignal",
          summary:
            "Record evidence-bound local quality feedback or reversible noise control",
          parameters: [idParameter],
          requestBody: {
            required: true,
            content: jsonContent("SubmitLocalAttentionReviewRequest"),
          },
          responses: {
            "200": {
              description: "Synthetic signal with its current local review",
              content: jsonContent("LocalAttentionSignal"),
            },
            "400": {
              description: "Invalid review or snooze window",
              content: jsonContent("ErrorResponse"),
            },
            "404": {
              description: "Signal not found",
              content: jsonContent("ErrorResponse"),
            },
            "409": {
              description: "Signal evidence or review changed",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/attention-rules": {
        get: {
          operationId: "getLocalAttentionRules",
          responses: {
            "200": {
              description: "Provisional local rule preferences",
              content: jsonContent("LocalAttentionSettings"),
            },
          },
        },
        patch: {
          operationId: "updateLocalAttentionRules",
          summary: "Update audited reversible local attention preferences",
          requestBody: {
            required: true,
            content: jsonContent("UpdateLocalAttentionSettingsRequest"),
          },
          responses: {
            "200": {
              description: "Saved local rule preferences",
              content: jsonContent("LocalAttentionSettings"),
            },
            "409": {
              description: "Rule version changed",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/api/v1/attention-rules/audit": {
        get: {
          operationId: "listLocalAttentionAudit",
          parameters: pageParameters,
          responses: {
            "200": {
              description: "Paged local rule and signal transition audit",
              content: jsonContent("ListLocalAttentionAuditResponse"),
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
      securitySchemes: {
        localSyntheticBearer: {
          type: "http",
          scheme: "bearer",
          description:
            "Local synthetic receiver rehearsal token, not product authentication",
        },
        localRunnerBearer: {
          type: "http",
          scheme: "bearer",
          description:
            "Short-lived per-attempt synthetic local runner token, not product authentication",
        },
      },
      schemas: {
        ObservatorySceneQuery: component(observatorySceneQuerySchema, "input"),
        ObservatorySceneReadResult: component(observatorySceneReadResultSchema),
        ObservatoryMembershipQuery: component(
          observatoryMembershipQuerySchema,
          "input",
        ),
        ObservatoryMembershipPage: component(observatoryMembershipPageSchema),
        ObservatoryRelationsQuery: component(
          observatoryRelationsQuerySchema,
          "input",
        ),
        ObservatoryRelationsResult: component(observatoryRelationsResultSchema),
        ObservatorySignalEvidenceQuery: component(
          observatorySignalEvidenceQuerySchema,
          "input",
        ),
        ObservatorySignalEvidenceResult: component(
          observatorySignalEvidenceResultSchema,
        ),
        ObservatoryProviderExplanationQuery: component(
          observatoryProviderExplanationQuerySchema,
          "input",
        ),
        ObservatoryProviderExplanationResult: component(
          observatoryProviderExplanationResultSchema,
        ),
        ObservatoryOperationalEvidenceQuery: component(
          observatoryOperationalEvidenceQuerySchema,
          "input",
        ),
        ObservatoryOperationalEvidenceResult: component(
          observatoryOperationalEvidenceResultSchema,
        ),
        ObservatoryCatalogueQuery: component(
          observatoryCatalogueQuerySchema,
          "input",
        ),
        ObservatoryCatalogueResult: component(observatoryCatalogueResultSchema),
        ObservatoryProviderFeedQuery: component(
          observatoryProviderFeedQuerySchema,
          "input",
        ),
        ObservatoryProviderFeedResult: component(
          observatoryProviderFeedResultSchema,
        ),
        ObservatoryAnnotationChange: component(
          observatoryAnnotationChangeSchema,
          "input",
        ),
        ObservatoryRelationChange: component(
          observatoryRelationChangeSchema,
          "input",
        ),
        ObservatoryProviderMappingChange: component(
          observatoryProviderMappingChangeSchema,
          "input",
        ),
        ObservatorySourceBindingChange: component(
          observatorySourceBindingChangeSchema,
          "input",
        ),
        ObservatoryClientScopeChange: component(
          observatoryClientScopeChangeSchema,
          "input",
        ),
        ObservatoryLogoQuery: component(observatoryLogoQuerySchema, "input"),
        ObservatoryLogoReadResult: component(observatoryLogoReadResultSchema),
        ObservatoryLogoPreview: component(
          observatoryLogoPreviewSchema,
          "input",
        ),
        ObservatoryLogoPreviewResult: component(
          observatoryLogoPreviewResultSchema,
        ),
        ObservatoryLogoChange: component(observatoryLogoChangeSchema, "input"),
        ObservatoryLogoFailure: component(observatoryLogoFailureSchema),
        // Exact public port receipt, not a raw storage or owner identity envelope.
        ObservatoryReviewReceipt: component(
          z.strictObject({
            id: observatoryAnnotationChangeSchema.shape.resourceId,
            version: observatoryViewSchema.shape.version,
            auditId: observatoryAnnotationChangeSchema.shape.resourceId,
          }),
        ),
        ObservatoryViewCreate: component(observatoryViewCreateSchema, "input"),
        ObservatoryViewUpdate: component(observatoryViewUpdateSchema, "input"),
        ObservatoryViewDelete: component(observatoryViewDeleteSchema, "input"),
        ObservatoryViewRead: component(observatoryViewReadSchema, "input"),
        ObservatoryViewPageQuery: component(
          observatoryViewPageQuerySchema,
          "input",
        ),
        ObservatoryView: component(observatoryViewSchema),
        ObservatoryViewPage: component(observatoryViewPageSchema),
        ObservatoryViewDeleted: component(observatoryViewDeletedSchema),
        FoundationProjectWorkQuery: component(
          foundationProjectWorkQuerySchema,
          "input",
        ),
        FoundationProjectWorkPage: component(foundationProjectWorkPageSchema),
        ObservatoryInputTooLarge: component(
          z.strictObject({ code: z.literal("INPUT_TOO_LARGE") }),
        ),
        MnemosyneImportEnvelope: component(
          mnemosyneImportEnvelopeSchema,
          "input",
        ),
        MnemosyneImportPlan: component(mnemosyneImportPlanSchema, "input"),
        FoundationImprovementPage: component(
          foundationImprovementPageSchema,
          "input",
        ),
        FoundationImprovementDetail: component(
          foundationImprovementDetailSchema,
          "input",
        ),
        FoundationImprovementDecisionInput: component(
          foundationImprovementDecisionInputSchema,
          "input",
        ),
        FoundationFindingProposalDetail: component(
          foundationFindingProposalDetailSchema,
          "input",
        ),
        FoundationFindingProposalReviewInput: component(
          foundationFindingProposalReviewInputSchema,
          "input",
        ),
        FoundationOnboardingPage: component(
          foundationOnboardingPageSchema,
          "input",
        ),
        FoundationOnboardingDetail: component(
          foundationOnboardingDetailSchema,
          "input",
        ),
        FoundationOnboardingPreview: component(
          foundationOnboardingPreviewSchema,
          "input",
        ),
        FoundationOnboardingReviewInput: component(
          foundationOnboardingReviewInputSchema,
          "input",
        ),
        FoundationOnboardingApplyInput: component(
          foundationOnboardingApplyInputSchema,
          "input",
        ),
        FoundationImprovementDecisionMutation: component(
          z.strictObject({
            record: foundationImprovementDecisionSchema,
            replayed: z.boolean(),
            correlationId: z.uuid(),
          }),
          "input",
        ),
        FoundationFindingProposalReviewMutation: component(
          z.strictObject({
            record: foundationFindingProposalReviewReceiptSchema,
            replayed: z.boolean(),
            correlationId: z.uuid(),
          }),
          "input",
        ),
        FoundationOnboardingDecisionMutation: component(
          z.strictObject({
            record: foundationOnboardingDecisionSchema,
            replayed: z.boolean(),
            correlationId: z.uuid(),
          }),
          "input",
        ),
        FoundationOnboardingOutcomeMutation: component(
          z.strictObject({
            record: foundationOnboardingOutcomeSchema,
            replayed: z.boolean(),
            correlationId: z.uuid(),
          }),
          "input",
        ),
        FoundationTaskProposalDetail: component(
          foundationTaskProposalDetailSchema,
        ),
        FoundationTaskProposalReviewInput: component(
          foundationTaskProposalReviewInputSchema,
          "input",
        ),
        FoundationTaskProposalReviewMutation: component(
          z.strictObject({
            record: foundationTaskProposalReviewReceiptSchema,
            replayed: z.boolean(),
            correlationId: z.uuid(),
          }),
          "input",
        ),
        FoundationSelectedImportInput: component(
          foundationSelectedImportInputSchema,
          "input",
        ),
        FoundationSelectedImportResult: component(
          foundationSelectedImportResultSchema,
          "input",
        ),
        FoundationImportRevision: component(
          foundationImportRevisionSchema,
          "input",
        ),
        FoundationImportOriginalSource: component(
          foundationImportOriginalSourceSchema,
          "input",
        ),
        FoundationImportOriginalPage: component(
          foundationImportOriginalPageSchema,
          "input",
        ),
        FoundationImportOriginalQuery: component(
          foundationImportOriginalQuerySchema,
          "input",
        ),
        FoundationCreateClient: component(
          foundationCreateClientSchema,
          "input",
        ),
        FoundationClient: component(foundationClientSchema, "input"),
        FoundationIssuedClient: component(
          foundationIssuedClientSchema,
          "input",
        ),
        FoundationClientList: component(foundationClientListSchema, "input"),
        FoundationFailure: component(foundationFailureSchema, "input"),
        FoundationAssessment: component(foundationAssessmentSchema, "input"),
        FoundationAssessmentMutation: component(
          z.strictObject({
            record: foundationAssessmentSchema,
            replayed: z.boolean(),
            correlationId: z.uuid(),
          }),
          "input",
        ),
        FoundationReviewMemoryBody: component(
          foundationReviewMemorySchema.omit({ memoryId: true }),
          "input",
        ),
        FoundationVerifyMemoryBody: component(
          foundationVerifyMemorySchema.omit({ memoryId: true }),
          "input",
        ),
        FoundationApproveInstructionBody: component(
          foundationApproveInstructionSchema.omit({ memoryId: true }),
          "input",
        ),
        FoundationOwnerMemoryRead: component(
          foundationOwnerMemoryReadSchema,
          "input",
        ),
        FoundationMemoryMutation: component(
          z.strictObject({
            record: foundationMemorySchema,
            replayed: z.boolean(),
            correlationId: z.uuid(),
          }),
          "input",
        ),
        FoundationInstructionMutation: component(
          z.strictObject({
            record: foundationInstructionApprovalSchema,
            replayed: z.boolean(),
            correlationId: z.uuid(),
          }),
          "input",
        ),
        CreateKnowledgeClient: component(createKnowledgeClientSchema),
        KnowledgeClient: component(knowledgeClientSchema),
        CreatedKnowledgeClient: component(createdKnowledgeClientSchema),
        ListKnowledgeClients: component(listKnowledgeClientsSchema),
        HealthResponse: component(healthResponseSchema),
        ErrorResponse: component(errorResponseSchema),
        CorrelationMetadata: component(correlationMetadataSchema),
        VersionResponse: component(versionResponseSchema),
        ResourceSummary: component(resourceSummarySchema),
        InfrastructureOverview: component(infrastructureOverviewSchema),
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
        ResourceImpactResponse: component(resourceImpactResponseSchema),
        ProjectSummary: component(projectSummarySchema),
        ProjectMetadataEvent: component(projectMetadataEventSchema),
        ListProjectMetadataEventsResponse: component(
          listProjectMetadataEventsResponseSchema,
        ),
        ProjectPresentation: component(projectPresentationSchema),
        UpdateProjectPresentationRequest: component(
          updateProjectPresentationRequestSchema,
        ),
        ProjectPresentationEvent: component(projectPresentationEventSchema),
        ListProjectPresentationEventsResponse: component(
          listProjectPresentationEventsResponseSchema,
        ),
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
        UpdateProjectRequest: component(updateProjectRequestSchema),
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
        CreateRealIntegrationRequest: component(
          createRealIntegrationRequestSchema,
        ),
        RealIntegration: component(realIntegrationSchema),
        ListRealIntegrationsResponse: component(
          listRealIntegrationsResponseSchema,
        ),
        LinuxHostSample: component(linuxHostSampleSchema),
        RealSourceEnvelope: component(realSourceEnvelopeSchema),
        ListRealObservationsResponse: component(
          listRealObservationsResponseSchema,
        ),
        RealReceiverToken: component(realReceiverTokenSchema),
        SetRealIntegrationEnabledRequest: component(
          setRealIntegrationEnabledRequestSchema,
        ),

        SavedViewDefinition: component(savedViewDefinitionSchema),
        SavedView: component(savedViewSchema),
        CreateSavedViewRequest: component(createSavedViewRequestSchema),
        UpdateSavedViewRequest: component(updateSavedViewRequestSchema),
        ArchiveSavedViewRequest: component(archiveSavedViewRequestSchema),
        ListSavedViewsResponse: component(listSavedViewsResponseSchema),
        SavedViewAuditEvent: component(savedViewAuditEventSchema),
        ListSavedViewAuditResponse: component(listSavedViewAuditResponseSchema),
        LocalFileTextProjection: component(localFileTextProjectionSchema),
        LocalFileTextJobV1: component(localFileTextJobV1Schema),
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
        LocalRecoveryDrill: component(localRecoveryDrillSchema),
        ListLocalRecoveryDrillsResponse: component(
          listLocalRecoveryDrillsResponseSchema,
        ),
        LocalRecoveryStatus: component(localRecoveryStatusSchema),
        LocalBackupEvidence: component(localBackupEvidenceSchema),
        ListLocalBackupsResponse: component(listLocalBackupsResponseSchema),
        LocalReleaseRehearsal: component(localReleaseRehearsalSchema),
        ListLocalReleaseRehearsalsResponse: component(
          listLocalReleaseRehearsalsResponseSchema,
        ),
        LocalReleasePreflight: component(localReleasePreflightSchema),
        ListLocalReleasePreflightsResponse: component(
          listLocalReleasePreflightsResponseSchema,
        ),
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
        AutomationEvidenceCheck: component(automationEvidenceCheckSchema),
        ListAutomationEvidenceChecksResponse: component(
          listAutomationEvidenceChecksResponseSchema,
        ),
        AutomationExportPage: component(automationExportPageSchema),
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
        ProjectFlowKind: component(projectFlowKindSchema),
        ProjectFlowRelated: component(projectFlowRelatedSchema),
        ProjectFlowItem: component(projectFlowItemSchema),
        ListProjectFlowQuery: component(listProjectFlowQuerySchema),
        ListProjectFlowResponse: component(listProjectFlowResponseSchema),
        ProjectAgentFinding: component(projectAgentFindingSchema),
        ListProjectAgentFindingsQuery: component(
          listProjectAgentFindingsQuerySchema,
        ),
        ListProjectAgentFindingsResponse: component(
          listProjectAgentFindingsResponseSchema,
        ),
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
        LocalAgentRoutingCandidate: component(localAgentRoutingCandidateSchema),
        LocalAgentRoutingResponse: component(localAgentRoutingResponseSchema),
        CachedLocalAgentResultQuery: component(
          cachedLocalAgentResultQuerySchema,
        ),
        CachedLocalAgentResult: component(cachedLocalAgentResultSchema),
        CachedLocalAgentResultResponse: component(
          cachedLocalAgentResultResponseSchema,
        ),
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
        LocalAgentCallbackRequest: component(localAgentCallbackRequestSchema),
        LocalAgentCallbackEvent: component(localAgentCallbackEventSchema),
        ListLocalAgentCallbacksResponse: component(
          listLocalAgentCallbacksResponseSchema,
        ),
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
        SetLocalIntegrationFreshnessRequest: component(
          setLocalIntegrationFreshnessRequestSchema,
        ),
        RunLocalIntegrationSampleRequest: component(
          runLocalIntegrationSampleRequestSchema,
        ),
        LocalIntegration: component(localIntegrationSchema),
        LocalConnectorToken: component(localConnectorTokenSchema),
        LocalConnectorFeedItem: component(localConnectorFeedItemSchema),
        ListLocalConnectorFeedResponse: component(
          listLocalConnectorFeedResponseSchema,
        ),
        ListLocalIntegrationsResponse: component(
          listLocalIntegrationsResponseSchema,
        ),
        SyntheticEventImportJobV1: component(syntheticEventImportJobV1Schema),
        SyntheticEventImport: component(syntheticEventImportSchema),
        SyntheticFlowReplay: component(syntheticFlowReplaySchema),
        SyntheticFlowReplayStage: component(syntheticFlowReplayStageSchema),
        ListSyntheticEventImportsResponse: component(
          listSyntheticEventImportsResponseSchema,
        ),
        SourceEnvelope: component(
          z.union([sourceEnvelopeSchema, realSourceEnvelopeSchema]),
        ),
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
        LocalAttentionSettings: component(localAttentionSettingsSchema),
        UpdateLocalAttentionSettingsRequest: component(
          updateLocalAttentionSettingsRequestSchema,
        ),
        LocalAttentionSignal: component(localAttentionSignalSchema),
        LocalAttentionReview: component(localAttentionReviewSchema),
        SubmitLocalAttentionReviewRequest: component(
          submitLocalAttentionReviewRequestSchema,
        ),
        ListLocalAttentionSignalsResponse: component(
          listLocalAttentionSignalsResponseSchema,
        ),
        LocalAttentionAuditEvent: component(localAttentionAuditEventSchema),
        ListLocalAttentionAuditResponse: component(
          listLocalAttentionAuditResponseSchema,
        ),
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
