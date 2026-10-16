import { afterEach, describe, expect, it, vi } from "vitest";
import { FoundationError } from "@commandry/domain";
import { foundationWorkflowHttp } from "./foundation-workflows-http";
const mocks = vi.hoisted(() => {
  const unavailable = () =>
    vi.fn(async (): Promise<unknown> => {
      throw new Error("Unexpected fixture dispatch");
    });
  return {
    owner: vi.fn(),
    improvement: {
      list: unavailable(),
      get: unavailable(),
      review: unavailable(),
    },
    findings: {
      get: unavailable(),
      byCapture: unavailable(),
      review: unavailable(),
    },
    onboarding: {
      list: unavailable(),
      get: unavailable(),
      preview: unavailable(),
      review: unavailable(),
      apply: unavailable(),
    },
  };
});
vi.mock("./foundation-access", async (original) => ({
  ...(await original<typeof import("./foundation-access")>()),
  foundationWorkflowOwner: mocks.owner,
}));
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projectId = id(1),
  proposalId = id(2),
  at = "2026-10-16T12:00:00.000Z";
const input = {
  projectId,
  proposalId,
  expectedProposalDigest: "a".repeat(64),
  expectedPreviewDigest: "b".repeat(64),
  expectedDecisionVersion: 0,
  decision: "approved",
  reason: "Exact inventory reviewed.",
  expiresAt: "2026-10-17T12:00:00.000Z",
  inventoryReviewed: true,
};
const decision = {
  ...input,
  schemaVersion: 1,
  id: id(3),
  version: 1,
  recordedBy: "user:owner",
  recordedAt: at,
  contentDigest: "c".repeat(64),
  preconditions: { resource: null, link: null, identityResourceId: null },
};
function request(
  path: string[],
  options: {
    query?: string;
    body?: unknown;
    raw?: string;
    method?: string;
  } = {},
) {
  const method =
    options.method ??
    (options.body !== undefined || options.raw !== undefined ? "POST" : "GET");
  const url =
    "http://localhost/api/v1/foundation/workflows/" +
    path.join("/") +
    (options.query ?? "");
  return foundationWorkflowHttp(
    new Request(url, {
      method,
      ...(method === "POST"
        ? {
            headers: {
              "content-type": "application/json",
              "idempotency-key": "Exact.Workflow-1",
              origin: "http://localhost",
            },
            body: options.raw ?? JSON.stringify(options.body),
          }
        : {}),
    }),
    path,
  );
}
function owner() {
  mocks.owner.mockResolvedValue({
    improvement: mocks.improvement,
    findings: mocks.findings,
    onboarding: mocks.onboarding,
  });
}
afterEach(() => {
  vi.clearAllMocks();
});
describe("owner workflow HTTP adapter", () => {
  it("authorizes before reading selectors or a request body, sanitizes errors and disables caching", async () => {
    mocks.owner.mockRejectedValueOnce(
      new FoundationError("INVALID_CREDENTIAL", "PRIVATE_SESSION"),
    );
    const result = await request(["onboarding", "review"], { raw: "not JSON" });
    expect(result.status).toBe(401);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ code: "INVALID_CREDENTIAL" });
    expect(mocks.onboarding.review).not.toHaveBeenCalled();
  });
  it("binds list selectors and continuations and rejects duplicate or unknown query fields", async () => {
    owner();
    mocks.improvement.list.mockResolvedValue({
      schemaVersion: 1,
      projectId,
      items: [],
      nextCursor: null,
    });
    const result = await request(["improvements"], {
      query: `?projectId=${projectId}&limit=7&cursor=opaque`,
    });
    expect(result.status).toBe(200);
    expect(mocks.improvement.list).toHaveBeenCalledWith({
      projectId,
      limit: 7,
      cursor: "opaque",
    });
    for (const query of [
      `?projectId=${projectId}&projectId=${id(99)}`,
      `?projectId=${projectId}&owner=true`,
      `?projectId=${projectId}&limit=0`,
    ])
      expect((await request(["improvements"], { query })).status).toBe(400);
    expect(mocks.improvement.list).toHaveBeenCalledTimes(1);
  });
  it("treats wrong-scope or malformed persisted output as unavailable rather than caller input errors", async () => {
    owner();
    mocks.improvement.list
      .mockResolvedValueOnce({
        schemaVersion: 1,
        projectId: id(99),
        items: [],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ PRIVATE_DATABASE: "detail" });
    for (let n = 0; n < 2; n++) {
      const result = await request(["improvements"], {
        query: `?projectId=${projectId}`,
      });
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ code: "FOUNDATION_UNAVAILABLE" });
    }
  });
  it("uses strict bounded JSON and refuses caller-supplied owner authority", async () => {
    owner();
    expect(
      (
        await request(["onboarding", "review"], {
          body: { ...input, recordedBy: "user:spoof" },
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(["onboarding", "review"], { raw: " ".repeat(131073) }))
        .status,
    ).toBe(413);
    expect(mocks.onboarding.review).not.toHaveBeenCalled();
  });
  it("returns only a matching immutable owner decision and preserves its idempotency key", async () => {
    owner();
    mocks.onboarding.review.mockResolvedValue({
      record: decision,
      replayed: true,
      correlationId: id(4),
    });
    const result = await request(["onboarding", "review"], { body: input });
    expect(result.status).toBe(200);
    expect(mocks.onboarding.review).toHaveBeenCalledWith(
      input,
      "Exact.Workflow-1",
    );
    expect(await result.json()).toMatchObject({
      replayed: true,
      record: { reason: input.reason },
    });
    mocks.onboarding.review.mockResolvedValue({
      record: { ...decision, reason: "Different reason" },
      replayed: false,
      correlationId: id(4),
    });
    expect(
      (await request(["onboarding", "review"], { body: input })).status,
    ).toBe(503);
  });
  it("does not route unsupported owner paths or query-bearing mutations to services", async () => {
    owner();
    expect(
      (await request(["onboarding", "install"], { body: input })).status,
    ).toBe(404);
    expect(
      (
        await request(["onboarding", "review"], {
          query: "?owner=true",
          body: input,
        })
      ).status,
    ).toBe(404);
    expect(mocks.onboarding.review).not.toHaveBeenCalled();
    expect(mocks.onboarding.apply).not.toHaveBeenCalled();
  });
});
