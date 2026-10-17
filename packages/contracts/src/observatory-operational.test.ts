import { describe, expect, it } from "vitest";
import {
  observatoryAvailabilityEvidenceSchema,
  observatoryOperationalEvidenceQuerySchema,
  observatoryOperationalEvidenceToolQuerySchema,
  observatoryOperationalEvidenceResultSchema,
  observatoryOperationalRepositoryDetailsSchema,
  observatoryOperationalSourceRecordSchema,
  observatoryPullRequestEvidenceSchema,
  observatorySecurityEvidenceSchema,
} from "./observatory-operational";
import { observatoryRepositoryEvidenceSchema } from "./observatory-repository";

const at = "2026-10-17T12:00:00.000Z";
const sourceId = "00000000-0000-4000-8000-000000000001";
const resourceId = "00000000-0000-4000-8000-000000000002";
const projectId = "00000000-0000-4000-8000-000000000003";

describe("shared owner and project-free operational tool queries", () => {
  it("retains every scene field and default while excluding project input from tools", () => {
    const scope = {
      schemaVersion: 1,
      grouping: "providers",
      environment: "production",
      expandedRepresentationIds: ["repository:expanded"],
      search: " exact head ",
      sectors: [],
      viewRevision: "review-2",
      resourceId,
      facet: "pull_requests",
    };
    for (const option of [
      {},
      { includePullRequestChecks: false },
      { includePullRequestChecks: true },
    ]) {
      const tool = observatoryOperationalEvidenceToolQuerySchema.parse({
        ...scope,
        ...option,
      });
      expect(tool).toEqual({ ...scope, search: "exact head", ...option });
      expect(
        observatoryOperationalEvidenceQuerySchema.parse({
          ...scope,
          ...option,
          projectId,
        }),
      ).toEqual({ ...tool, projectId });
    }
    const tool = observatoryOperationalEvidenceToolQuerySchema.parse({
      resourceId,
      facet: "pull_requests",
    });
    expect(tool).toEqual(
      observatoryOperationalEvidenceQuerySchema.parse({
        resourceId,
        facet: "pull_requests",
      }),
    );
    expect(tool).not.toHaveProperty("projectId");
    expect(tool).not.toHaveProperty("includePullRequestChecks");
  });

  it("uses the same PR-only opt-in validation for owner and project-free inputs", () => {
    for (const facet of ["availability", "pull_requests", "security"]) {
      for (const includePullRequestChecks of [
        undefined,
        false,
        true,
        "true",
        1,
        null,
      ]) {
        const query = {
          resourceId,
          facet,
          ...(includePullRequestChecks === undefined
            ? {}
            : { includePullRequestChecks }),
        };
        const owner = observatoryOperationalEvidenceQuerySchema.safeParse({
          ...query,
          projectId,
        });
        const tool =
          observatoryOperationalEvidenceToolQuerySchema.safeParse(query);
        const valid =
          includePullRequestChecks === undefined ||
          includePullRequestChecks === false ||
          (includePullRequestChecks === true && facet === "pull_requests");
        expect(owner.success).toBe(valid);
        expect(tool.success).toBe(valid);
        if (!owner.success && !tool.success)
          expect(tool.error.issues).toEqual(owner.error.issues);
      }
    }
  });

  it("rejects project and authority injection without losing strict scene validation", () => {
    for (const extra of [
      { projectId },
      { owner: true },
      { operations: ["work.read"] },
      { grants: ["observatory.read"] },
      { sourceId: resourceId },
      { now: at },
      { limit: 100 },
      { schemaVersion: 2 },
      { resourceId: "invalid" },
      { facet: "work" },
    ])
      expect(
        observatoryOperationalEvidenceToolQuerySchema.safeParse({
          resourceId,
          facet: "pull_requests",
          ...extra,
        }).success,
      ).toBe(false);
  });
});

function availability() {
  return {
    monitorId: "synthetic-monitor",
    monitorStatus: "down",
    enabled: true,
    sourceState: "available",
    reason: "observed",
    lastCheckedAt: at,
    latestCheck: {
      checkedAt: at,
      status: "down",
      responseTimeMs: null,
      statusCode: 503,
    },
    openIncident: { id: "incident-one", startedAt: at, acknowledgedAt: at },
    recentChecksLimit: 25,
    historyComplete: false,
  };
}
const empty = () => ({
  state: "available",
  readAt: at,
  complete: true,
  items: [],
  errorCode: null,
  retrySeconds: null,
});
function repository() {
  return observatoryRepositoryEvidenceSchema.parse({
    schemaVersion: 1,
    repository: {
      owner: "synthetic-owner",
      name: "repository",
      url: "https://github.com/synthetic-owner/repository",
    },
    readAt: at,
    pullRequests: {
      ...empty(),
      items: [
        {
          id: 1,
          number: 1,
          title: "<script>literal, never authority</script>",
          draft: false,
          updatedAt: at,
          baseRef: "main",
          headRef: "feature",
          author: null,
          url: "https://github.com/synthetic-owner/repository/pull/1",
        },
      ],
    },
    security: {
      codeScanning: {
        analyses: empty(),
        alerts: empty(),
        currentHeadCoverage: "unknown",
      },
      dependabot: empty(),
      secretScanning: empty(),
    },
  });
}
function source() {
  return {
    sourceId,
    projectId,
    resourceId,
    kind: "infraagent-monitor",
    version: 1,
    environment: "production",
    enabled: true,
    lastAttemptAt: at,
    lastSuccessAt: at,
    lastError: null,
    observedAt: at,
    freshness: "fresh",
    payload: availability(),
  };
}
function result() {
  return {
    schemaVersion: 1,
    scopeDigest: "scope",
    projectionRevision: "projection",
    completeness: "complete",
    resourceId,
    facet: "availability",
    access: "available",
    items: [source()],
  };
}

describe("strict operational evidence queries and derived payloads", () => {
  it("preserves old query inputs and accepts only an explicit boolean PR check opt-in", () => {
    for (const facet of ["availability", "pull_requests", "security"]) {
      const original = observatoryOperationalEvidenceQuerySchema.parse({
        resourceId,
        facet,
      });
      expect(original).not.toHaveProperty("includePullRequestChecks");
      expect(original.schemaVersion).toBe(1);
      expect(
        observatoryOperationalEvidenceQuerySchema.parse({
          resourceId,
          facet,
          includePullRequestChecks: false,
        }),
      ).toEqual({ ...original, includePullRequestChecks: false });
      expect(
        observatoryOperationalEvidenceQuerySchema.safeParse({
          resourceId,
          facet,
          includePullRequestChecks: true,
        }).success,
      ).toBe(facet === "pull_requests");
    }
    for (const includePullRequestChecks of ["true", 1, null, {}, []])
      expect(
        observatoryOperationalEvidenceQuerySchema.safeParse({
          resourceId,
          facet: "pull_requests",
          includePullRequestChecks,
        }).success,
      ).toBe(false);
  });
  it("requires the canonical project UUID on both adapter records and public source items", () => {
    const { projectId: _projectId, ...missingProject } = source();
    expect(
      observatoryOperationalEvidenceResultSchema.safeParse({
        ...result(),
        items: [missingProject],
      }).success,
    ).toBe(false);
    expect(
      observatoryOperationalEvidenceResultSchema.safeParse({
        ...result(),
        items: [{ ...source(), projectId: "not-a-project" }],
      }).success,
    ).toBe(false);
    const {
      sourceId: id,
      freshness: _freshness,
      payload: details,
      ...fields
    } = missingProject;
    expect(
      observatoryOperationalSourceRecordSchema.safeParse({
        ...fields,
        id,
        details,
        freshnessSeconds: 300,
      }).success,
    ).toBe(false);
    expect(
      observatoryOperationalSourceRecordSchema.safeParse({
        ...fields,
        projectId: "not-a-project",
        id,
        details,
        freshnessSeconds: 300,
      }).success,
    ).toBe(false);
    expect(
      observatoryOperationalEvidenceResultSchema.parse(result()).items[0]
        ?.projectId,
    ).toBe(projectId);
  });
  it("extends scene scope without accepting caller authority or source selection", () => {
    expect(
      observatoryOperationalEvidenceQuerySchema.parse({
        resourceId,
        facet: "security",
      }),
    ).toMatchObject({
      schemaVersion: 1,
      resourceId,
      facet: "security",
      grouping: "operational",
      environment: null,
    });
    for (const field of [
      "owner",
      "grants",
      "operations",
      "sourceId",
      "sourceIds",
      "actor",
      "capabilities",
      "rawPayload",
      "limit",
      "now",
    ])
      expect(
        observatoryOperationalEvidenceQuerySchema.safeParse({
          resourceId,
          facet: "security",
          [field]: "injected",
        }).success,
      ).toBe(false);
    for (const value of [
      { resourceId: "bad", facet: "security" },
      { resourceId, facet: "work" },
      { resourceId },
      { facet: "availability" },
    ])
      expect(
        observatoryOperationalEvidenceQuerySchema.safeParse(value).success,
      ).toBe(false);
  });
  it("preserves the failing check and acknowledgment without a passing claim", () => {
    const dto = observatoryAvailabilityEvidenceSchema.parse(availability());
    expect(dto.latestCheck?.status).toBe("down");
    expect(dto.openIncident?.acknowledgedAt).toBe(at);
    expect(
      observatoryOperationalEvidenceResultSchema.parse(result()).items,
    ).toHaveLength(1);
  });
  it.each([
    "target",
    "url",
    "config",
    "heartbeatUrl",
    "rawPayload",
    "secret",
    "token",
    "owner",
    "error",
  ])("rejects availability private/authority field %s", (field) => {
    expect(
      observatoryAvailabilityEvidenceSchema.safeParse({
        ...availability(),
        [field]: "unsafe",
      }).success,
    ).toBe(false);
  });
  it("rejects invalid check dates, source-state contradictions and nested raw errors", () => {
    const payload = availability();
    for (const value of [
      { ...payload, sourceState: "healthy" },
      { ...payload, reason: "paused" },
      { ...payload, lastCheckedAt: null },
      {
        ...payload,
        latestCheck: { ...payload.latestCheck, checkedAt: "invalid" },
      },
      {
        ...payload,
        latestCheck: { ...payload.latestCheck, error: "private body" },
      },
      { ...payload, latestCheck: { ...payload.latestCheck, statusCode: 999 } },
      {
        ...payload,
        openIncident: { ...payload.openIncident, acknowledgedAt: "invalid" },
      },
      { ...payload, historyComplete: true },
    ])
      expect(
        observatoryAvailabilityEvidenceSchema.safeParse(value).success,
      ).toBe(false);
  });
  it("validates each repository facet with the original exact identity/link/completeness invariants", () => {
    const full = repository();
    const pull = {
      repository: full.repository,
      readAt: full.readAt,
      pullRequests: full.pullRequests,
    };
    const security = {
      repository: full.repository,
      readAt: full.readAt,
      security: full.security,
    };
    expect(observatoryPullRequestEvidenceSchema.parse(pull)).toEqual(pull);
    expect(observatorySecurityEvidenceSchema.parse(security)).toEqual(security);
    expect(
      observatoryPullRequestEvidenceSchema.safeParse({
        ...pull,
        security: full.security,
      }).success,
    ).toBe(false);
    expect(
      observatorySecurityEvidenceSchema.safeParse({
        ...security,
        pullRequests: full.pullRequests,
      }).success,
    ).toBe(false);
    expect(
      observatoryPullRequestEvidenceSchema.safeParse({
        ...pull,
        repository: {
          ...full.repository,
          url: "https://github.com/other/repo",
        },
      }).success,
    ).toBe(false);
    expect(
      observatoryPullRequestEvidenceSchema.safeParse({
        ...pull,
        pullRequests: {
          ...full.pullRequests,
          items: [
            {
              ...full.pullRequests.items[0],
              url: "https://github.com/other/repo/pull/1",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      observatorySecurityEvidenceSchema.safeParse({
        ...security,
        security: {
          ...full.security,
          secretScanning: { ...empty(), state: "inaccessible" },
        },
      }).success,
    ).toBe(false);
    expect(
      observatoryOperationalRepositoryDetailsSchema.safeParse({
        sourceState: "unknown",
        reason: "no_observation",
        repository: full,
        rawPayload: {},
      }).success,
    ).toBe(false);
  });
  it("rejects cross-facet payloads, foreign subjects, duplicate sources and invalid observation freshness", () => {
    const full = repository();
    for (const value of [
      { ...result(), facet: "security" },
      {
        ...result(),
        facet: "pull_requests",
        items: [
          {
            ...source(),
            kind: "github-repository",
            payload: {
              repository: full.repository,
              readAt: at,
              security: full.security,
            },
          },
        ],
      },
      { ...result(), resourceId: sourceId },
      { ...result(), items: [source(), source()] },
      { ...result(), items: [{ ...source(), observedAt: null }] },
      { ...result(), items: [{ ...source(), freshness: "unknown" }] },
      {
        ...result(),
        items: [{ ...source(), lastError: "PRIVATE_PROVIDER_BODY" }],
      },
      { ...result(), items: [{ ...source(), lastSuccessAt: "invalid" }] },
      { ...result(), items: [{ ...source(), payload: null }] },
      { ...result(), access: "unsupported" },
    ])
      expect(
        observatoryOperationalEvidenceResultSchema.safeParse(value).success,
      ).toBe(false);
  });
  it.each([
    "rawPayload",
    "encryptedOriginal",
    "config",
    "token",
    "secretLiteral",
    "session",
    "owner",
    "grants",
  ])("rejects extra source/result field %s", (field) => {
    expect(
      observatoryOperationalEvidenceResultSchema.safeParse({
        ...result(),
        [field]: "unsafe",
      }).success,
    ).toBe(false);
    expect(
      observatoryOperationalEvidenceResultSchema.safeParse({
        ...result(),
        items: [{ ...source(), [field]: "unsafe" }],
      }).success,
    ).toBe(false);
    const {
      sourceId: id,
      freshness: _freshness,
      payload: details,
      ...fields
    } = source();
    expect(
      observatoryOperationalSourceRecordSchema.safeParse({
        ...fields,
        id,
        freshnessSeconds: 300,
        details,
        [field]: "unsafe",
      }).success,
    ).toBe(false);
  });
  it("requires exact record metadata and permits a configured unread or disabled source without inventing an observation", () => {
    const {
      sourceId: id,
      freshness: _freshness,
      payload: details,
      ...fields
    } = source();
    const row = { ...fields, id, freshnessSeconds: 300, details };
    expect(observatoryOperationalSourceRecordSchema.parse(row)).toEqual(row);
    for (const extra of [
      { freshnessSeconds: 29 },
      { freshnessSeconds: 86401 },
      { id: "invalid" },
      { resourceId: "invalid" },
      { kind: "github" },
      { version: 0 },
      { details: undefined },
    ])
      expect(
        observatoryOperationalSourceRecordSchema.safeParse({ ...row, ...extra })
          .success,
      ).toBe(false);
    for (const enabled of [true, false])
      expect(
        observatoryOperationalEvidenceResultSchema.parse({
          ...result(),
          access: enabled ? "unavailable" : "disabled",
          items: [
            {
              ...source(),
              enabled,
              observedAt: null,
              freshness: "unknown",
              payload: null,
            },
          ],
        }).items[0]?.observedAt,
      ).toBeNull();
    expect(
      observatoryOperationalEvidenceResultSchema.parse({
        ...result(),
        access: "unavailable",
        items: [],
      }).access,
    ).toBe("unavailable");
  });
});
