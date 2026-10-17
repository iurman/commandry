import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
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

type Shape = {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Shape>;
  required?: string[];
  additionalProperties?: boolean;
  anyOf?: Shape[];
  oneOf?: Shape[];
  items?: Shape;
  format?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
};
type Content = { "application/json": { schema: Shape } };
type Operation = {
  operationId: string;
  summary: string;
  description: string;
  parameters: {
    in: string;
    name: string;
    required: boolean;
    description: string;
    schema: Shape;
  }[];
  requestBody: { required: boolean; content: Content };
  responses: Record<
    string,
    {
      description: string;
      content: Content;
      headers: Record<string, { schema: Shape }>;
    }
  >;
};
type Document = {
  openapi: string;
  paths: Record<string, { post?: Operation }>;
  components: { schemas: Record<string, Shape> };
};
const document = JSON.parse(
  readFileSync(new URL("../openapi/openapi.json", import.meta.url), "utf8"),
) as Document;
const base = "/api/v1/infrastructure/observatory/";
type Route = {
  path: string;
  input: string;
  inputSchema: z.ZodType;
  output: string;
  outputSchema?: z.ZodType;
  read?: boolean;
  conflict?: boolean;
  notFound?: boolean;
};
const routes: Route[] = [
  {
    path: "scene",
    input: "ObservatorySceneQuery",
    inputSchema: observatorySceneQuerySchema,
    output: "ObservatorySceneReadResult",
    outputSchema: observatorySceneReadResultSchema,
    read: true,
  },
  {
    path: "members",
    input: "ObservatoryMembershipQuery",
    inputSchema: observatoryMembershipQuerySchema,
    output: "ObservatoryMembershipPage",
    outputSchema: observatoryMembershipPageSchema,
    read: true,
  },
  {
    path: "relations",
    input: "ObservatoryRelationsQuery",
    inputSchema: observatoryRelationsQuerySchema,
    output: "ObservatoryRelationsResult",
    outputSchema: observatoryRelationsResultSchema,
    read: true,
  },
  {
    path: "signals",
    input: "ObservatorySignalEvidenceQuery",
    inputSchema: observatorySignalEvidenceQuerySchema,
    output: "ObservatorySignalEvidenceResult",
    outputSchema: observatorySignalEvidenceResultSchema,
    read: true,
  },
  {
    path: "providers",
    input: "ObservatoryProviderExplanationQuery",
    inputSchema: observatoryProviderExplanationQuerySchema,
    output: "ObservatoryProviderExplanationResult",
    outputSchema: observatoryProviderExplanationResultSchema,
    read: true,
  },
  {
    path: "operational",
    input: "ObservatoryOperationalEvidenceQuery",
    inputSchema: observatoryOperationalEvidenceQuerySchema,
    output: "ObservatoryOperationalEvidenceResult",
    outputSchema: observatoryOperationalEvidenceResultSchema,
    read: true,
  },
  {
    path: "catalogue",
    input: "ObservatoryCatalogueQuery",
    inputSchema: observatoryCatalogueQuerySchema,
    output: "ObservatoryCatalogueResult",
    outputSchema: observatoryCatalogueResultSchema,
    read: true,
  },
  {
    path: "provider-feed",
    input: "ObservatoryProviderFeedQuery",
    inputSchema: observatoryProviderFeedQuerySchema,
    output: "ObservatoryProviderFeedResult",
    outputSchema: observatoryProviderFeedResultSchema,
    read: true,
  },
  {
    path: "reviews/annotation",
    input: "ObservatoryAnnotationChange",
    inputSchema: observatoryAnnotationChangeSchema,
    output: "ObservatoryReviewReceipt",
    conflict: true,
  },
  {
    path: "reviews/relation",
    input: "ObservatoryRelationChange",
    inputSchema: observatoryRelationChangeSchema,
    output: "ObservatoryReviewReceipt",
    conflict: true,
  },
  {
    path: "reviews/provider",
    input: "ObservatoryProviderMappingChange",
    inputSchema: observatoryProviderMappingChangeSchema,
    output: "ObservatoryReviewReceipt",
    conflict: true,
  },
  {
    path: "reviews/source",
    input: "ObservatorySourceBindingChange",
    inputSchema: observatorySourceBindingChangeSchema,
    output: "ObservatoryReviewReceipt",
    conflict: true,
  },
  {
    path: "reviews/client_scope",
    input: "ObservatoryClientScopeChange",
    inputSchema: observatoryClientScopeChangeSchema,
    output: "ObservatoryReviewReceipt",
    conflict: true,
  },
  {
    path: "views/create",
    input: "ObservatoryViewCreate",
    inputSchema: observatoryViewCreateSchema,
    output: "ObservatoryView",
    outputSchema: observatoryViewSchema,
    conflict: true,
  },
  {
    path: "views/update",
    input: "ObservatoryViewUpdate",
    inputSchema: observatoryViewUpdateSchema,
    output: "ObservatoryView",
    outputSchema: observatoryViewSchema,
    conflict: true,
  },
  {
    path: "views/delete",
    input: "ObservatoryViewDelete",
    inputSchema: observatoryViewDeleteSchema,
    output: "ObservatoryViewDeleted",
    outputSchema: observatoryViewDeletedSchema,
    conflict: true,
  },
  {
    path: "views/read",
    input: "ObservatoryViewRead",
    inputSchema: observatoryViewReadSchema,
    output: "ObservatoryView",
    outputSchema: observatoryViewSchema,
  },
  {
    path: "views/page",
    input: "ObservatoryViewPageQuery",
    inputSchema: observatoryViewPageQuerySchema,
    output: "ObservatoryViewPage",
    outputSchema: observatoryViewPageSchema,
  },
  {
    path: "work/page",
    input: "FoundationProjectWorkQuery",
    inputSchema: foundationProjectWorkQuerySchema,
    output: "FoundationProjectWorkPage",
    outputSchema: foundationProjectWorkPageSchema,
    notFound: false,
  },
];
function schema(name: string): Shape {
  const result = document.components.schemas[name];
  if (!result) throw new Error(`Missing documented schema ${name}`);
  return result;
}
function operation(path: string): Operation {
  const result = document.paths[base + path]?.post;
  if (!result) throw new Error(`Missing documented operation ${path}`);
  return result;
}
function canonical(value: z.ZodType, io: "input" | "output") {
  const result = z.toJSONSchema(value, { io });
  delete result.$schema;
  return JSON.parse(JSON.stringify(result)) as Shape;
}
function properties(name: string) {
  return schema(name).properties!;
}
function nonNull(value: Shape): Shape {
  return value.anyOf?.find((item) => item.type !== "null") ?? value;
}

describe("generated owner Observatory HTTP contract", () => {
  it("lists exactly all 19 concrete POST routes while retaining the entire prior 210-path population", () => {
    const paths = Object.keys(document.paths),
      actual = paths.filter((path) => path.startsWith(base)).sort();
    expect(actual).toEqual(routes.map((route) => base + route.path).sort());
    for (const path of actual)
      expect(Object.keys(document.paths[path]!)).toEqual(["post"]);
    const prior = paths.filter((path) => !path.startsWith(base)).sort();
    expect(prior).toHaveLength(210);
    expect(
      createHash("sha256").update(JSON.stringify(prior)).digest("hex"),
    ).toBe("9586a88696e5af528f19527b525f2551d358dbe18cac43b6a5474a1619ea86d0");
    expect(
      new Set(routes.map((route) => operation(route.path).operationId)).size,
    ).toBe(19);
    expect(document.openapi).toBe("3.1.0");
  });

  it.each(routes)(
    "uses canonical shared request and result structures for $path",
    (route) => {
      const post = operation(route.path);
      expect(post.requestBody.required).toBe(true);
      expect(post.requestBody.content["application/json"].schema).toEqual({
        $ref: `#/components/schemas/${route.input}`,
      });
      expect(schema(route.input)).toEqual(
        canonical(route.inputSchema, "input"),
      );
      expect(post.responses["200"]?.content["application/json"].schema).toEqual(
        { $ref: `#/components/schemas/${route.output}` },
      );
      if (route.outputSchema)
        expect(schema(route.output)).toEqual(
          canonical(route.outputSchema, "output"),
        );
      expect(schema(route.input).additionalProperties).toBe(false);
      for (const forbidden of [
        "owner",
        "ownerId",
        "principalId",
        "sessionId",
        "capabilities",
        "credential",
        "apiKey",
      ])
        expect(schema(route.input).properties).not.toHaveProperty(forbidden);
    },
  );

  it.each(routes)(
    "documents actual authority, bounded input, headers and operation-specific failures for $path",
    (route) => {
      const post = operation(route.path);
      expect(post.description).toContain(
        "actual live allowlisted owner password session",
      );
      expect(post.description).toContain("trusted Origin");
      expect(post.description).toContain(
        "No machine bearer credential grants owner authority",
      );
      expect(post.description).toContain("262144");
      expect(post.description).toContain("cross-field");
      const origin = post.parameters.find(
        (parameter) => parameter.name === "Origin",
      );
      expect(origin).toMatchObject({ in: "header", required: !route.read });
      expect(
        post.parameters.some(
          (parameter) => parameter.name === "Idempotency-Key",
        ),
      ).toBe(false);
      if (route.read) {
        expect(origin?.description).toContain("password mode");
        expect(origin?.description).toContain("local auth-off");
        expect(post.description).toContain(
          "canonically audited as observatory.read",
        );
        expect(post.description).toContain("Reading does not probe a service");
      } else expect(origin?.description).toContain("No auth-off fallback");
      const statuses = [
        "200",
        "400",
        "401",
        "403",
        ...(route.notFound === false ? [] : ["404"]),
        ...(route.conflict ? ["409"] : []),
        "413",
        "503",
      ];
      expect(Object.keys(post.responses).sort()).toEqual(statuses.sort());
      for (const [status, response] of Object.entries(post.responses)) {
        expect(response.headers["Cache-Control"]?.schema).toEqual({
          type: "string",
          const: "no-store",
        });
        expect(response.headers["X-Correlation-Id"]?.schema).toMatchObject({
          type: "string",
          minLength: 1,
          maxLength: 100,
        });
        if (status !== "200")
          expect(response.content["application/json"].schema).toEqual({
            $ref: `#/components/schemas/${status === "413" ? "ObservatoryInputTooLarge" : "FoundationFailure"}`,
          });
      }
    },
  );

  it("documents the exact code-only oversized body and strict public review receipt", () => {
    expect(schema("ObservatoryInputTooLarge")).toEqual(
      canonical(
        z.strictObject({ code: z.literal("INPUT_TOO_LARGE") }),
        "output",
      ),
    );
    const receipt = schema("ObservatoryReviewReceipt");
    expect(receipt.additionalProperties).toBe(false);
    expect(receipt.required?.slice().sort()).toEqual([
      "auditId",
      "id",
      "version",
    ]);
    expect(Object.keys(receipt.properties!).sort()).toEqual([
      "auditId",
      "id",
      "version",
    ]);
    expect(receipt.properties?.id).toMatchObject({
      type: "string",
      format: "uuid",
    });
    expect(receipt.properties?.auditId).toMatchObject({
      type: "string",
      format: "uuid",
    });
    expect(receipt.properties?.version).toMatchObject({
      type: "integer",
      exclusiveMinimum: 0,
    });
    expect(schema("FoundationFailure").properties?.code?.enum).not.toContain(
      "INPUT_TOO_LARGE",
    );
  });

  it("distinguishes opaque membership, structured provider/Work and UUID private-view continuations", () => {
    const member = properties("ObservatoryMembershipQuery");
    expect(nonNull(member.cursor!)).toMatchObject({ type: "string" });
    for (const required of ["groupId", "scopeDigest", "projectionRevision"])
      expect(schema("ObservatoryMembershipQuery").required).toContain(required);
    expect(operation("members").description).toContain("opaque text cursor");
    expect(operation("members").description).toContain(
      "Follow every nextCursor to null",
    );
    expect(operation("members").description).toContain(
      "Restart from the scene",
    );
    const feed = nonNull(properties("ObservatoryProviderFeedQuery").cursor!);
    expect(feed.type).toBe("object");
    expect(feed.required?.slice().sort()).toEqual([
      "afterId",
      "revision",
      "scopeDigest",
    ]);
    expect(feed.properties?.afterId?.format).not.toBe("uuid");
    expect(operation("provider-feed").description).toContain(
      "{afterId,revision,scopeDigest}",
    );
    expect(operation("provider-feed").description).toContain(
      "recorded_provider_notices",
    );
    const work = nonNull(properties("FoundationProjectWorkQuery").cursor!);
    expect(work.required?.slice().sort()).toEqual(["afterId", "projectId"]);
    expect(work.properties?.afterId?.format).toBe("uuid");
    expect(operation("work/page").description).toContain("{projectId,afterId}");
    expect(operation("work/page").description).toContain(
      "cursor project never grants access",
    );
    expect(
      nonNull(properties("ObservatoryViewPageQuery").cursor!),
    ).toMatchObject({ type: "string", format: "uuid" });
    expect(operation("views/page").description).toContain(
      "UUID nextCursor to null",
    );
    for (const name of [
      "ObservatoryMembershipQuery",
      "ObservatoryProviderFeedQuery",
      "ObservatoryViewPageQuery",
      "FoundationProjectWorkQuery",
    ])
      expect(properties(name).limit).toMatchObject({
        minimum: 1,
        maximum: 100,
      });
    expect(member.limit?.default).toBe(25);
    expect(properties("ObservatoryProviderFeedQuery").limit?.default).toBe(50);
    expect(properties("ObservatoryViewPageQuery").limit?.default).toBe(25);
    expect(properties("FoundationProjectWorkQuery").limit?.default).toBe(25);
  });

  it("keeps complete source-inclusive owner catalogues distinct from the narrower machine contract", () => {
    expect(properties("ObservatoryCatalogueQuery").kind?.enum).toEqual([
      "annotation",
      "relation",
      "provider",
      "source",
    ]);
    const result = schema("ObservatoryCatalogueResult");
    const variants = result.oneOf ?? result.anyOf ?? [];
    expect(variants.map((item) => item.properties?.kind?.const)).toEqual([
      "annotation",
      "relation",
      "provider",
      "source",
    ]);
    for (const variant of variants) {
      expect(variant.additionalProperties).toBe(false);
      expect(variant.properties?.items?.maxItems).toBeUndefined();
      expect(variant.properties?.completeness?.const).toBe("complete");
    }
    const source = variants.find(
      (variant) => variant.properties?.kind?.const === "source",
    )!.properties!.items!.items!;
    expect(source.required).toEqual(
      expect.arrayContaining([
        "id",
        "resourceId",
        "projectId",
        "version",
        "enabled",
        "provenance",
      ]),
    );
    expect(source.properties?.sourceKind?.enum).toEqual([
      "infraagent-monitor",
      "github-repository",
      "http-readiness",
    ]);
    const description = operation("catalogue").description;
    expect(description).toContain(
      "Machine catalogue is deliberately narrower and excludes source configuration",
    );
    expect(description).toContain(
      "every active/inactive or enabled/disabled record",
    );
    expect(description).toContain("without a public cursor or fixed row cap");
    for (const path of ["relations", "signals", "providers", "operational"]) {
      expect(operation(path).description).toContain("complete");
      expect(operation(path).description).toMatch(
        /no public cursor|without a public cursor/,
      );
    }
  });

  it.each([
    ["annotation", "reversible", "observatory.annotation.review"],
    ["relation", "reversible", "observatory.relation.review"],
    ["provider", "reversible", "observatory.provider_mapping.review"],
    ["source", "sensitive", "observatory.source.review"],
    ["client_scope", "sensitive", "observatory.client_scope.review"],
  ])(
    "keeps %s review evidence, actual version preconditions, declared risk and canonical audit",
    (kind, risk, audit) => {
      const route = routes.find((item) => item.path === `reviews/${kind}`)!;
      const body = properties(route.input);
      expect(body.expectedVersion).toMatchObject({
        type: "integer",
        minimum: 0,
      });
      expect(schema(route.input).required).toContain("expectedVersion");
      expect(body.review?.additionalProperties).toBe(false);
      expect(body.review?.required?.slice().sort()).toEqual([
        "evidenceRefs",
        "note",
      ]);
      expect(operation(route.path).description.toLowerCase()).toContain(
        `${risk} owner-only review`,
      );
      expect(operation(route.path).description).toContain(audit);
      expect(operation(route.path).description).toContain(
        "evidenceRefs and review note",
      );
    },
  );

  it("documents private view scope semantics and exposes the public view rather than storage/tombstones", () => {
    expect(properties("ObservatoryViewCreate").expectedVersion?.const).toBe(0);
    expect(schema("ObservatoryViewUpdate").required).toContain("projectId");
    expect(schema("ObservatoryViewPageQuery").required ?? []).not.toContain(
      "projectId",
    );
    expect(operation("views/page").description).toContain(
      "Omitted projectId means all this owner's views",
    );
    expect(operation("views/page").description).toContain(
      "projectId=null means global views only",
    );
    for (const path of ["views/read", "views/page"]) {
      expect(operation(path).description).toContain("observatory.view.read");
      expect(operation(path).description).toContain("owner-private");
    }
    for (const hidden of [
      "ownerId",
      "principalId",
      "sessionId",
      "creation",
      "deleted",
      "envelopeVersion",
    ])
      expect(properties("ObservatoryView")).not.toHaveProperty(hidden);
    expect(properties("ObservatoryViewDeleted").deleted?.const).toBe(true);
    expect(operation("views/create").description).toContain(
      "Configuration never changes canonical topology",
    );
  });

  it("retains canonical live Work semantics without claiming a snapshot or actual AgentRun", () => {
    expect(schema("FoundationProjectWorkQuery").required).toContain(
      "projectId",
    );
    expect(properties("FoundationProjectWorkPage").consistency?.const).toBe(
      "live",
    );
    expect(properties("FoundationProjectWorkPage").selectedAt?.format).toBe(
      "date-time",
    );
    const item = properties("FoundationProjectWorkPage").items?.items;
    expect(item?.additionalProperties).toBe(false);
    expect(item?.required).toEqual(["work", "contentDigest"]);
    expect(item?.properties?.work?.required).toContain("contextLink");
    const description = operation("work/page").description;
    expect(description).toContain(
      "exact Foundation Project Work query and shared canonical serializer",
    );
    expect(description).toContain(
      "primary project OR active related-project membership",
    );
    expect(description).toContain("not a snapshot cutoff or Work updatedAt");
    expect(description).toContain(
      "missing actual AgentRun state remains unknown",
    );
    expect(description).toContain("observatory.work.read");
  });

  it("documents fixed readiness and source configuration without inventing probe history, credentials or authority", () => {
    const source = properties("ObservatorySourceBindingChange");
    expect(source.kind?.enum).toEqual([
      "infraagent-monitor",
      "github-repository",
      "http-readiness",
    ]);
    expect(source.freshnessSeconds).toMatchObject({
      type: "integer",
      minimum: 30,
      maximum: 86400,
    });
    for (const hidden of [
      "apiKey",
      "credential",
      "appOrigin",
      "targetUrl",
      "baseUrl",
    ])
      expect(source).not.toHaveProperty(hidden);
    expect(operation("reviews/source").description).toContain(
      "only commandry-web-readiness",
    );
    expect(operation("reviews/source").description).toContain(
      "enabled=false deactivates without deleting evidence",
    );
    expect(operation("operational").description).toContain(
      "not a 25-check history or end-user uptime guarantee",
    );
    expect(operation("operational").description).toContain(
      "a read cannot freshen old evidence or activate a source",
    );
  });
});
