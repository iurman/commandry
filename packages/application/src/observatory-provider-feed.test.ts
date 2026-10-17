import { describe, expect, it, vi } from "vitest";
import {
  createObservatoryReadService,
  type ObservatoryReadAccess,
  type ObservatoryReadRecords,
} from "./observatory";
import {
  observatoryProviderFeedResultSchema,
  type ObservatoryProviderFeedQuery,
} from "@commandry/contracts";
import { mixedObservatoryFixture } from "@commandry/test-support";

function fixture() {
  const input = mixedObservatoryFixture();
  const projectId = input.projects[0]!.id;
  input.resources = input.resources.map((item) => ({
    ...item,
    projects: [input.projects[0]!],
  }));
  const access: ObservatoryReadAccess = {
    owner: false,
    projectIds: [projectId],
    resourceIds: null,
    scopeDigest: "provider:test",
    operations: ["observatory.read", "observatory.providers.read"],
    environment: "test",
  };
  const at = input.now;
  const notices = Array.from({ length: 137 }, (_, n) => {
    const id = `notice-${String(n).padStart(3, "0")}`;
    return {
      providerId: "cloudflare",
      id,
      record: {
        id,
        kind: "incident",
        title: "<script>literal source</script>",
        status: "investigating",
        severity: "major",
        componentIds: ["workers"],
        createdAt: at,
        updatedAt: at,
        resolvedAt: null,
        scheduledFor: null,
        scheduledUntil: null,
        evidenceHref: `https://www.cloudflarestatus.com/incidents/${id}`,
        updates: [],
      },
      sourceUpdatedAt: at,
      active: true,
      reconciledAt: null,
      lastSeenAt: at,
    };
  });
  const header = {
    state: "unavailable",
    lastSuccessAt: at,
    lastAttemptAt: at,
    lastError: "PROVIDER_TIMEOUT",
    revision: 3,
    snapshot: {
      provider: "cloudflare",
      endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json",
      readAt: at,
      reportedAt: at,
      complete: true,
      components: [],
      notices: [],
    },
  };
  const readProviderFeed = vi.fn(
    async ({ afterId, limit }: { afterId?: string; limit: number }) => {
      const start = afterId
        ? notices.findIndex((item) => item.id === afterId) + 1
        : 0;
      const page = notices.slice(start, start + limit);
      return {
        ...header,
        notices: page,
        nextCursor: start + limit < notices.length ? page.at(-1)!.id : null,
      };
    },
  );
  const records: ObservatoryReadRecords = {
    readObservatory: vi.fn(async () => input),
    readProviderFeed,
  };
  let after: ((result: unknown) => void) | undefined;
  const service = createObservatoryReadService<string>(
    {
      async withRead(_request, callback) {
        const result = await callback(access, records);
        after?.(result);
        return result;
      },
    },
    { environment: "test", now: () => new Date(at) },
  );
  return {
    service,
    access,
    records,
    readProviderFeed,
    projectId,
    notices,
    header,
    tamper: (fn: typeof after) => {
      after = fn;
    },
  };
}

describe("authorized recorded public provider feed", () => {
  it("reaches all 137 actual records through revision-bound continuation while retaining failure and source times", async () => {
    const f = fixture();
    let cursor: ObservatoryProviderFeedQuery["cursor"] = null;
    const found: string[] = [];
    do {
      const page = observatoryProviderFeedResultSchema.parse(
        await f.service.providerFeed("request", {
          projectId: f.projectId,
          limit: 50,
          cursor,
        }),
      );
      found.push(...page.items.map((item) => item.id));
      expect(page.feed.state).toBe("unavailable");
      expect(page.items[0]!.record.updatedAt).toBe(
        f.header.snapshot.reportedAt,
      );
      expect(page.items[0]!.record.title).toBe(
        "<script>literal source</script>",
      );
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(found).size).toBe(137);
    expect(f.readProviderFeed).toHaveBeenCalledTimes(3);
  });
  it("requires both grants before any population or auxiliary read", async () => {
    for (const operations of [
      [],
      ["observatory.read"],
      ["observatory.providers.read"],
    ] as ObservatoryReadAccess["operations"][]) {
      const f = fixture();
      f.access.operations = operations;
      await expect(
        f.service.providerFeed("request", { projectId: f.projectId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.records.readObservatory).not.toHaveBeenCalled();
      expect(f.readProviderFeed).not.toHaveBeenCalled();
    }
  });
  it("rejects changed scope/revision and malformed or contaminated records rather than successful partial data", async () => {
    const f = fixture();
    const first = await f.service.providerFeed("request", {
      projectId: f.projectId,
      limit: 50,
    });
    for (const cursor of [
      { ...first.nextCursor!, revision: 4 },
      { ...first.nextCursor!, scopeDigest: "foreign" },
    ])
      await expect(
        f.service.providerFeed("request", { projectId: f.projectId, cursor }),
      ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    for (const extra of [
      { rawPayload: { private: true } },
      { notices: f.notices.slice(0, 101) },
      { nextCursor: "forged" },
    ]) {
      f.readProviderFeed.mockImplementationOnce(
        async () =>
          ({ ...f.header, notices: [], nextCursor: null, ...extra }) as never,
      );
      await expect(
        f.service.providerFeed("request", { projectId: f.projectId }),
      ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    }
    const getter = vi.fn(() => "private");
    f.readProviderFeed.mockImplementationOnce(
      async () =>
        Object.defineProperty({}, "rawPayload", {
          enumerable: true,
          get: getter,
        }) as never,
    );
    await expect(
      f.service.providerFeed("request", { projectId: f.projectId }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(getter).not.toHaveBeenCalled();
  });
  it("withholds revoked auxiliary reads and altered port deliveries; missing adapters are unavailable", async () => {
    const f = fixture();
    f.readProviderFeed.mockImplementationOnce(async () => {
      f.access.operations = [];
      return { ...f.header, notices: [], nextCursor: null };
    });
    await expect(
      f.service.providerFeed("request", { projectId: f.projectId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const altered = fixture();
    altered.tamper((result) => {
      (result as { items: unknown[] }).items = [];
    });
    await expect(
      altered.service.providerFeed("request", { projectId: altered.projectId }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    const absent = fixture();
    delete absent.records.readProviderFeed;
    await expect(
      absent.service.providerFeed("request", { projectId: absent.projectId }),
    ).rejects.toThrow("Provider feed is unavailable");
  });
});
