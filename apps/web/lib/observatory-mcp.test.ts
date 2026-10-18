import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import {
  createFoundationMachineService,
  createObservatoryReadService,
  type FoundationAccessPort,
  type ObservatoryReadAccess,
  type FoundationMachineRequest,
} from "@commandry/application";
import {
  foundationActorSchema,
  observatorySceneReadResultSchema,
  observatoryMembershipPageSchema,
  observatoryOperationalEvidenceResultSchema,
  observatoryRepositoryEvidenceSchema,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationTokenDigest,
  type FoundationOperation,
} from "@commandry/domain";
import { mixedObservatoryFixture } from "@commandry/test-support";
import { createFoundationMcpServer } from "./foundation-mcp";
import { createObservatoryMcpReads } from "./observatory-mcp";
const token = "af_" + "x".repeat(43);
const operations: FoundationOperation[] = [
  "observatory.read",
  "observatory.signals.read",
  "observatory.security.read",
  "observatory.providers.read",
  "work.read",
];
async function fixture(grants = operations, operationalRows?: unknown[]) {
  const original = mixedObservatoryFixture();
  const project = original.projects[0]!;
  const repository = original.resources.find(
    (resource) => resource.kind === "repository",
  )!;
  const logo = {
    resourceId: repository.id,
    digest: "f".repeat(64),
    mediaType: "image/png" as const,
    width: 128 as const,
    height: 128 as const,
    version: 2,
  };
  const input = {
    ...original,
    resources: original.resources.map((resource) => ({
      ...resource,
      projects: [project],
    })),
    logos: [logo],
  };
  const access: ObservatoryReadAccess = {
    owner: false,
    projectIds: [project.id],
    resourceIds: null,
    scopeDigest: "mcp:authorized",
    operations: [...grants],
    environment: "test",
  };
  const requests: FoundationMachineRequest[] = [];
  const actor = foundationActorSchema.parse({
    schemaVersion: 1,
    principalId: "foundation-client:00000000-0000-4000-8000-000000000001",
    clientId: "00000000-0000-4000-8000-000000000001",
    projectId: project.id,
    environment: "test",
    expiresAt: "2099-01-01T00:00:00Z",
    correlationId: "00000000-0000-4000-8000-000000000002",
    runId: null,
    resourceIds: [],
    capabilities: grants,
  });
  const make = (operation: FoundationOperation) =>
    createObservatoryReadService<FoundationMachineRequest>(
      {
        async withRead(request, callback) {
          expect(request.operation).toBe(operation);
          expect(request.projectId).toBe(project.id);
          expect(request.tokenDigest).toBe(foundationTokenDigest(token));
          requests.push(request);
          if (!access.operations.includes(operation))
            throw new FoundationError("FORBIDDEN");
          return callback(access, {
            readObservatory: async () => input,
            ...(operationalRows
              ? { readOperationalEvidence: async () => operationalRows }
              : {}),
            readCatalogue: async () => [],
            readLogo: async (resourceId: string) =>
              resourceId === logo.resourceId
                ? {
                    resourceId,
                    version: logo.version,
                    digest: logo.digest,
                    dataBase64: "iVBORw0KGgo=",
                  }
                : null,
            readProviderFeed: async () => ({
              state: "unknown",
              lastSuccessAt: null,
              lastAttemptAt: null,
              lastError: null,
              revision: 0,
              snapshot: null,
              notices: [],
              nextCursor: null,
            }),
          });
        },
      },
      { environment: "test", now: () => new Date(input.now) },
    );
  const reads = createObservatoryMcpReads(make, token, actor);
  const core = createFoundationMachineService(
    {
      withClient: async () => {
        throw new Error("Unrelated foundation operation");
      },
    } as unknown as FoundationAccessPort,
    { environment: "test" },
  );
  const handler = createMcpHandler(
    () => createFoundationMcpServer(core, token, actor, { observatory: reads }),
    { responseMode: "json" },
  );
  const client = new Client({
    name: "observatory-protocol-test",
    version: "1",
  });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL("http://127.0.0.1/mcp/foundation"),
      { fetch: async (input, init) => handler.fetch(new Request(input, init)) },
    ),
  );
  return {
    client,
    handler,
    access,
    reads,
    requests,
    project,
    input,
    logo,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}
describe("Observatory discovery and reads over the actual MCP SDK", () => {
  it("discovers the optional project-free PR check query and preserves default versus explicit richer SDK reads", async () => {
    const rows: unknown[] = [];
    const f = await fixture(operations, rows);
    try {
      const tool = (await f.client.listTools()).tools.find(
        (item) => item.name === "get_observatory_operational_evidence",
      )!;
      expect(tool.inputSchema.properties).not.toHaveProperty("projectId");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(
        tool.inputSchema.properties?.includePullRequestChecks,
      ).toMatchObject({ type: "boolean" });
      expect(tool.inputSchema.required).not.toContain(
        "includePullRequestChecks",
      );
      const resourceId = f.input.resources.find(
        (item) => item.kind === "repository",
      )!.id;
      const at = f.input.now,
        root = "https://github.com/synthetic-owner/repository",
        headSha = "b".repeat(40);
      const empty = {
        state: "available",
        readAt: at,
        complete: true,
        items: [],
        errorCode: null,
        retrySeconds: null,
      };
      const legacy = {
        id: 1,
        number: 1,
        title: "Exact SDK PR",
        draft: false,
        updatedAt: at,
        baseRef: "main",
        headRef: "feature",
        author: null,
        url: root + "/pull/1",
      };
      const repository = observatoryRepositoryEvidenceSchema.parse({
        schemaVersion: 1,
        repository: { owner: "synthetic-owner", name: "repository", url: root },
        readAt: at,
        pullRequests: {
          ...empty,
          items: [
            {
              ...legacy,
              headSha,
              requiredCheckCoverage: "unknown",
              checkRuns: {
                ...empty,
                headSha,
                items: [
                  {
                    id: 1,
                    headSha,
                    name: "Exact SDK check",
                    status: "completed",
                    conclusion: "failure",
                    startedAt: at,
                    completedAt: at,
                    freshness: "fresh",
                    url: root + "/runs/1",
                  },
                ],
              },
              statuses: { ...empty, headSha },
            },
          ],
        },
        security: {
          codeScanning: {
            analyses: empty,
            alerts: empty,
            currentHeadCoverage: "unknown",
          },
          dependabot: empty,
          secretScanning: empty,
        },
      });
      rows.push({
        id: "00000000-0000-4000-8000-000000000004",
        projectId: f.project.id,
        resourceId,
        kind: "github-repository",
        version: 1,
        environment: "production",
        enabled: true,
        freshnessSeconds: 300,
        lastAttemptAt: at,
        lastSuccessAt: at,
        lastError: null,
        observedAt: at,
        details: { sourceState: "available", reason: "observed", repository },
      });
      const before = structuredClone(rows);
      const read = async (option: Record<string, boolean>) => {
        const response = await f.client.callTool({
          name: tool.name,
          arguments: { resourceId, facet: "pull_requests", ...option },
        });
        expect(response.isError).not.toBe(true);
        expect(response.content).toEqual([
          { type: "text", text: JSON.stringify(response.structuredContent) },
        ]);
        const parsed = observatoryOperationalEvidenceResultSchema.parse(
          response.structuredContent,
        );
        if (parsed.facet !== "pull_requests")
          throw new Error("Expected PR evidence");
        return parsed;
      };
      const original = await read({});
      const disabled = await read({ includePullRequestChecks: false });
      const complete = await read({ includePullRequestChecks: true });
      expect(disabled).toEqual(original);
      expect(original.items[0]!.payload).toEqual({
        repository: repository.repository,
        readAt: at,
        pullRequests: { ...empty, items: [legacy] },
      });
      expect(complete.items[0]!.payload).toEqual({
        repository: repository.repository,
        readAt: at,
        pullRequests: repository.pullRequests,
      });
      expect(complete.items[0]).toMatchObject({
        observedAt: at,
        freshness: "fresh",
        projectId: f.project.id,
      });
      expect(complete.items[0]!.payload).not.toHaveProperty("security");
      expect(f.requests).toHaveLength(3);
      expect(
        f.requests.every(
          (request) =>
            request.projectId === f.project.id &&
            request.operation === "work.read" &&
            request.environment === "test",
        ),
      ).toBe(true);
      expect(rows).toEqual(before);
    } finally {
      await f.close();
    }
  });

  it("enforces PR-only opt-in and strict no-project arguments before SDK reads without granting facet access", async () => {
    const f = await fixture(["observatory.read", "observatory.signals.read"]);
    try {
      const name = "get_observatory_operational_evidence",
        resourceId = f.input.resources[0]!.id;
      expect(
        (await f.client.listTools()).tools.map((tool) => tool.name),
      ).toContain(name);
      for (const query of [
        { facet: "availability", includePullRequestChecks: true },
        { facet: "security", includePullRequestChecks: true },
        { facet: "pull_requests", includePullRequestChecks: "true" },
        { facet: "pull_requests", includePullRequestChecks: null },
        {
          facet: "pull_requests",
          includePullRequestChecks: true,
          projectId: f.project.id,
        },
        { facet: "pull_requests", includePullRequestChecks: true, owner: true },
        {
          facet: "pull_requests",
          includePullRequestChecks: true,
          operations: ["work.read"],
        },
        {
          facet: "pull_requests",
          includePullRequestChecks: true,
          now: f.input.now,
        },
      ]) {
        const response = await f.client.callTool({
          name,
          arguments: { resourceId, ...query },
        });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toEqual({ code: "INVALID_INPUT" });
      }
      expect(f.requests).toHaveLength(0);
      for (const option of [
        {},
        { includePullRequestChecks: false },
        { includePullRequestChecks: true },
      ]) {
        const denied = await f.client.callTool({
          name,
          arguments: { resourceId, facet: "pull_requests", ...option },
        });
        expect(denied.isError).toBe(true);
        expect(denied.structuredContent).toEqual({ code: "FORBIDDEN" });
      }
      f.access.operations = [];
      const revoked = await f.client.callTool({
        name,
        arguments: {
          resourceId,
          facet: "availability",
          includePullRequestChecks: false,
        },
      });
      expect(revoked.isError).toBe(true);
      expect(revoked.structuredContent).toEqual({ code: "FORBIDDEN" });
    } finally {
      await f.close();
    }
  });

  it("discovers strict project-free separately granted tools and matches the shared complete scene", async () => {
    const f = await fixture();
    try {
      const tools = (await f.client.listTools()).tools;
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          "get_observatory_operational_evidence",
          "get_observatory_provider_explanation",
          "get_observatory_resource_logo",
          "get_observatory_scene",
          "get_observatory_signal_evidence",
          "list_observatory_members",
          "list_observatory_relations",
          "list_observatory_provider_notices",
          "list_observatory_reviewed_configuration",
        ].sort(),
      );
      for (const tool of tools) {
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.inputSchema.properties).not.toHaveProperty("projectId");
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
      const result = await f.client.callTool({
        name: "get_observatory_scene",
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      const dto = observatorySceneReadResultSchema.parse(
        result.structuredContent,
      );
      expect(dto.scene.population.canonicalResourceCount).toBe(91);
      expect(dto.scene.membershipIndex.resourceIds).toEqual(
        f.input.resources.map((r) => r.id).sort(),
      );
      expect(dto).toEqual(await f.reads.scene({}));
      const catalogue = await f.client.callTool({
        name: "list_observatory_reviewed_configuration",
        arguments: { kind: "relation" },
      });
      expect(catalogue.isError).not.toBe(true);
      expect(catalogue.structuredContent).toMatchObject({
        completeness: "complete",
        kind: "relation",
        items: [],
      });
      const feed = await f.client.callTool({
        name: "list_observatory_provider_notices",
        arguments: {},
      });
      expect(feed.isError).not.toBe(true);
      expect(feed.structuredContent).toMatchObject({
        population: "recorded_provider_notices",
        feed: { state: "unknown", snapshot: null },
        items: [],
        nextCursor: null,
      });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
      const group = dto.scene.representations.find((r) => r.memberCount > 30)!;
      expect(group).toBeDefined();
      let cursor: string | null = null;
      const ids: string[] = [];
      const cursors = new Set<string>();
      do {
        const response = await f.client.callTool({
          name: "list_observatory_members",
          arguments: {
            groupId: group.id,
            scopeDigest: dto.scene.scopeDigest,
            projectionRevision: dto.scene.projectionRevision,
            limit: 7,
            cursor,
          },
        });
        expect(response.isError).not.toBe(true);
        const page = observatoryMembershipPageSchema.parse(
          response.structuredContent,
        );
        ids.push(...page.items.map((item) => item.resourceId));
        cursor = page.nextCursor;
        if (cursor) {
          expect(cursors.has(cursor)).toBe(false);
          cursors.add(cursor);
        }
      } while (cursor);
      expect(new Set(ids).size).toBe(group.memberCount);
      expect(
        f.requests.every(
          (r) => r.targetId === null && r.environment === "test",
        ),
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
  it("shares approved logo references and images with the owner read service", async () => {
    const f = await fixture(["observatory.read"]);
    try {
      const scene = observatorySceneReadResultSchema.parse(
        (
          await f.client.callTool({
            name: "get_observatory_scene",
            arguments: {},
          })
        ).structuredContent,
      );
      const node = scene.scene.representations.find(
        (item) => item.resourceId === f.logo.resourceId && !item.referenceTo,
      )!;
      expect(node.logo).toEqual({
        digest: f.logo.digest,
        mediaType: "image/png",
        width: 128,
        height: 128,
        version: f.logo.version,
      });
      expect(
        scene.scene.representations
          .filter((item) => item.logo)
          .every((item) => item.resourceId === f.logo.resourceId),
      ).toBe(true);
      const image = await f.client.callTool({
        name: "get_observatory_resource_logo",
        arguments: { resourceId: f.logo.resourceId, digest: f.logo.digest },
      });
      expect(image.isError).not.toBe(true);
      expect(image.structuredContent).toEqual(
        await f.reads.logo({
          resourceId: f.logo.resourceId,
          digest: f.logo.digest,
        }),
      );
      expect(image.structuredContent).toMatchObject({
        resourceId: f.logo.resourceId,
        version: 2,
        image: { digest: f.logo.digest, mediaType: "image/png" },
      });
      const stale = await f.client.callTool({
        name: "get_observatory_resource_logo",
        arguments: { resourceId: f.logo.resourceId, digest: "0".repeat(64) },
      });
      expect(stale.isError).toBe(true);
      expect(stale.structuredContent).toEqual({ code: "NOT_FOUND" });
      const catalogue = await f.client.callTool({
        name: "list_observatory_reviewed_configuration",
        arguments: { kind: "logo" },
      });
      expect(catalogue.isError).not.toBe(true);
      expect(catalogue.structuredContent).toMatchObject({
        kind: "logo",
        items: [],
      });
      for (const extra of [
        { projectId: f.project.id },
        { dataBase64: "AAAA" },
      ]) {
        const denied = await f.client.callTool({
          name: "get_observatory_resource_logo",
          arguments: {
            resourceId: f.logo.resourceId,
            digest: f.logo.digest,
            ...extra,
          },
        });
        expect(denied.structuredContent).toEqual({ code: "INVALID_INPUT" });
      }
    } finally {
      await f.close();
    }
  });
  it("does not promote old grants and withholds facet authority after discovery", async () => {
    const old = await fixture(["resources.read", "work.read"]);
    try {
      expect((await old.client.listTools()).tools).toEqual([]);
    } finally {
      await old.close();
    }
    const f = await fixture(["observatory.read", "observatory.signals.read"]);
    try {
      const tools = (await f.client.listTools()).tools.map((t) => t.name);
      expect(tools).not.toContain("get_observatory_provider_explanation");
      expect(tools).not.toContain("list_observatory_provider_notices");
      expect(tools).toContain("list_observatory_reviewed_configuration");
      const protectedCatalogue = await f.client.callTool({
        name: "list_observatory_reviewed_configuration",
        arguments: { kind: "provider" },
      });
      expect(protectedCatalogue.structuredContent).toEqual({
        code: "FORBIDDEN",
      });
      const ownerOnly = await f.client.callTool({
        name: "list_observatory_reviewed_configuration",
        arguments: { kind: "source" },
      });
      expect(ownerOnly.structuredContent).toEqual({ code: "INVALID_INPUT" });
      const resourceId = f.input.resources[0]!.id;
      const denied = await f.client.callTool({
        name: "get_observatory_signal_evidence",
        arguments: { resourceId, facet: "security" },
      });
      expect(denied.isError).toBe(true);
      expect(denied.structuredContent).toEqual({ code: "FORBIDDEN" });
      const operationalDenied = await f.client.callTool({
        name: "get_observatory_operational_evidence",
        arguments: { resourceId, facet: "security" },
      });
      expect(operationalDenied.structuredContent).toEqual({
        code: "FORBIDDEN",
      });
      const operational = await f.client.callTool({
        name: "get_observatory_operational_evidence",
        arguments: { resourceId, facet: "availability" },
      });
      expect(operational.isError).not.toBe(true);
      expect(operational.structuredContent).toMatchObject({
        access: "unavailable",
        items: [],
      });
      f.access.operations = [];
      const revoked = await f.client.callTool({
        name: "get_observatory_scene",
        arguments: {},
      });
      expect(revoked.isError).toBe(true);
      expect(revoked.structuredContent).toEqual({ code: "FORBIDDEN" });
    } finally {
      await f.close();
    }
  });
  it("rejects body authority and stale member continuations before exposing data", async () => {
    const f = await fixture();
    try {
      for (const extra of [
        { projectId: f.project.id },
        { owner: true },
        { operations: ["observatory.security.read"] },
        { identity: { principalId: "owner" } },
      ]) {
        const response = await f.client.callTool({
          name: "get_observatory_scene",
          arguments: extra,
        });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toEqual({ code: "INVALID_INPUT" });
      }
      expect(f.requests).toHaveLength(0);
      const response = await f.client.callTool({
        name: "list_observatory_members",
        arguments: {
          groupId: "unknown",
          scopeDigest: "stale",
          projectionRevision: "stale",
        },
      });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toEqual({ code: "INVALID_REFERENCE" });
    } finally {
      await f.close();
    }
  });
});
