import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  captureSchema,
  createSyntheticEventImportRequestSchema,
  createCaptureRequestSchema,
  createProjectRequestSchema,
  createProjectResourceLinkRequestSchema,
  createResourceRequestSchema,
  createSyntheticRunRequestSchema,
  correlationMetadataSchema,
  errorResponseSchema,
  fileCaptureRequestSchema,
  fileCaptureResponseSchema,
  healthResponseSchema,
  knowledgeItemSchema,
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
  projectResourceLinkSchema,
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
        ProjectSummary: component(projectSummarySchema),
        CreateProjectRequest: component(createProjectRequestSchema),
        ListProjectsResponse: component(listProjectsResponseSchema),
        ProjectResourceLink: component(projectResourceLinkSchema),
        CreateProjectResourceLinkRequest: component(
          createProjectResourceLinkRequestSchema,
        ),
        ListProjectResourceLinksResponse: component(
          listProjectResourceLinksResponseSchema,
        ),
        CreateCaptureRequest: component(createCaptureRequestSchema),
        Capture: component(captureSchema),
        ListCapturesResponse: component(listCapturesResponseSchema),
        FileCaptureRequest: component(fileCaptureRequestSchema),
        FileCaptureResponse: component(fileCaptureResponseSchema),
        WorkItem: component(workItemSchema),
        KnowledgeItem: component(knowledgeItemSchema),
        ListWorkItemsResponse: component(listWorkItemsResponseSchema),
        ListKnowledgeItemsResponse: component(listKnowledgeItemsResponseSchema),
        SearchResult: component(searchResultSchema),
        SearchResponse: component(searchResponseSchema),
        CreateSyntheticEventImportRequest: component(
          createSyntheticEventImportRequestSchema,
        ),
        SyntheticEventImportJobV1: component(syntheticEventImportJobV1Schema),
        SyntheticEventImport: component(syntheticEventImportSchema),
        ListSyntheticEventImportsResponse: component(
          listSyntheticEventImportsResponseSchema,
        ),
        SourceEnvelope: component(sourceEnvelopeSchema),
        NormalizedEvent: component(normalizedEventSchema),
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
