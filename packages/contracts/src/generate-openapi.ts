import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  createProjectRequestSchema,
  createProjectResourceLinkRequestSchema,
  createResourceRequestSchema,
  createSyntheticRunRequestSchema,
  correlationMetadataSchema,
  errorResponseSchema,
  healthResponseSchema,
  listProjectResourceLinksResponseSchema,
  listProjectsResponseSchema,
  listResourcesResponseSchema,
  projectResourceLinkSchema,
  projectSummarySchema,
  resourceSummarySchema,
  syntheticJobV1Schema,
  syntheticRunSchema,
  versionResponseSchema,
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
