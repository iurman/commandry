import { expect, test } from "vitest";
import {
  createCaptureRequestSchema,
  createExecutionPacketRequestSchema,
  createLocalAgentRunRequestSchema,
  localAgentRunJobV1Schema,
  agentContextReadRequestSchema,
  fakeLocalAgentRunResultSchema,
  executionPacketSnapshotSchema,
  projectResourceLinkDetailSchema,
  listResourcesQuerySchema,
  searchQuerySchema,
  syntheticJobV1Schema,
} from "./index.js";

test("resource pagination has a bounded default", () => {
  expect(listResourcesQuerySchema.parse({})).toEqual({ limit: 25 });
  expect(listResourcesQuerySchema.safeParse({ limit: 101 }).success).toBe(
    false,
  );
});

test("synthetic jobs are versioned", () => {
  expect(
    syntheticJobV1Schema.safeParse({
      version: 2,
      runId: crypto.randomUUID(),
      occurrenceId: "x",
    }).success,
  ).toBe(false);
});

test("capture contracts preserve source text and reject malformed URLs", () => {
  const originalContent = "  Keep these spaces.\n";
  expect(
    createCaptureRequestSchema.parse({ inputType: "text", originalContent })
      .originalContent,
  ).toBe(originalContent);
  expect(
    createCaptureRequestSchema.safeParse({
      inputType: "url",
      originalContent: "ftp://example.test/file",
    }).success,
  ).toBe(false);
});

test("search requires a bounded term and scoped cursor", () => {
  expect(searchQuerySchema.safeParse({}).success).toBe(false);
  expect(searchQuerySchema.safeParse({ q: "timer", limit: 101 }).success).toBe(
    false,
  );
  expect(searchQuerySchema.parse({ q: " timer " }).q).toBe("timer");
});

test("packet selection is bounded and distinct", () => {
  const id = crypto.randomUUID();
  expect(createExecutionPacketRequestSchema.parse({})).toEqual({});
  expect(
    createExecutionPacketRequestSchema.safeParse({
      selectedKnowledgeIds: [id, id],
    }).success,
  ).toBe(false);
  expect(
    createExecutionPacketRequestSchema.safeParse({
      selectedResourceIds: Array.from({ length: 11 }, () =>
        crypto.randomUUID(),
      ),
    }).success,
  ).toBe(false);
});

test("packet snapshot must be explicit about missing policy and no action grants", () => {
  expect(
    executionPacketSnapshotSchema.safeParse({
      authorization: {
        capabilityGrants: ["deploy"],
        externalActions: "allowed",
      },
    }).success,
  ).toBe(false);
});

test("exact project-resource link detail carries only identity, type, lifecycle, and time", () => {
  const link = projectResourceLinkDetailSchema.parse({
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    resourceId: crypto.randomUUID(),
    type: "supports",
    lifecycle: "active",
    createdAt: "2026-09-26T11:00:00.000Z",
  });
  expect(link.type).toBe("supports");
  expect("externalUrl" in link).toBe(false);
});

test("local agent jobs are versioned and run submissions require an occurrence", () => {
  expect(
    localAgentRunJobV1Schema.safeParse({
      version: 2,
      runId: crypto.randomUUID(),
      occurrenceId: "x",
    }).success,
  ).toBe(false);
  expect(
    createLocalAgentRunRequestSchema.safeParse({
      agentId: crypto.randomUUID(),
      occurrenceId: " ",
    }).success,
  ).toBe(false);
});

test("arbitrary context operations reach policy while result cannot claim external actions", () => {
  const request = agentContextReadRequestSchema.parse({
    projectId: crypto.randomUUID(),
    operation: "deploy.execute",
    reason: "Test denial",
  });
  expect(request.operation).toBe("deploy.execute");
  expect(
    fakeLocalAgentRunResultSchema.safeParse({
      summary: "Fake result",
      contextReadIds: [],
      evidence: [],
      runtime: "local-fake-v1",
      isSynthetic: true,
      verificationStatus: "unverified",
      externalActions: ["deployed"],
    }).success,
  ).toBe(false);
});
