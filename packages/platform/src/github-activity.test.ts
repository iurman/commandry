import { describe, expect, it, vi } from "vitest";
import { createGitHubActivityReader } from "./github-activity";
const claim = {
  id: crypto.randomUUID(),
  leaseId: crypto.randomUUID(),
  identifier: "iurman/commandry",
  page: 1,
  etag: '"old"',
  pendingEtag: null,
};
describe("GitHub public activity adapter", () => {
  it("uses conditional requests, honors polling, and follows only scoped pagination", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _options?: RequestInit) =>
        new Response("[]", {
          headers: {
            etag: '"new"',
            "x-poll-interval": "120",
            link: '<https://api.github.com/repos/iurman/commandry/events?per_page=100&page=2>; rel="next"',
          },
        }),
    );
    const page = await createGitHubActivityReader(fetcher)(claim);
    expect(page).toMatchObject({
      hasNext: true,
      pollSeconds: 120,
      etag: '"new"',
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/iurman/commandry/events?per_page=100&page=1",
    );
    expect(
      await createGitHubActivityReader(fetcher)({
        ...claim,
        identifier: "Iurman/Commandry",
      }),
    ).toMatchObject({ hasNext: true });
  });
  it("handles unchanged pages without inventing activity", async () => {
    expect(
      await createGitHubActivityReader(
        async () => new Response(null, { status: 304 }),
      )(claim),
    ).toMatchObject({ events: [], notModified: true, hasNext: false });
  });
  it("accepts GitHub's numeric repository continuation only when page events corroborate its scope", async () => {
    const events = [
      { repo: { id: 1372162104, name: "iurman/commandry" } },
      { repo: { id: 1372162104, name: "Iurman/Commandry" } },
    ];
    const response = (body: unknown, repository = "1372162104") =>
      new Response(JSON.stringify(body), {
        headers: {
          link: `<https://api.github.com/repositories/${repository}/events?per_page=100&page=2>; rel="next"`,
        },
      });
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _options?: RequestInit) =>
        response(events),
    );
    expect(await createGitHubActivityReader(fetcher)(claim)).toMatchObject({
      events,
      hasNext: true,
    });
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/iurman/commandry/events?per_page=100&page=1",
    );
    for (const body of [
      [],
      [{ repo: { id: 99, name: claim.identifier } }],
      [{ repo: { id: 1372162104, name: "another/repository" } }],
      ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1372162104"].map((id) => [
        { repo: { id, name: claim.identifier } },
      ]),
      [...events, { repo: { id: 99, name: claim.identifier } }],
      [null],
    ]) {
      await expect(
        createGitHubActivityReader(async () => response(body))(claim),
      ).rejects.toThrow("GITHUB_INVALID_PAGINATION");
    }
    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        createGitHubActivityReader(async () =>
          response([{ repo: { id, name: claim.identifier } }], String(id)),
        )(claim),
      ).rejects.toThrow("GITHUB_INVALID_PAGINATION");
    }
    await expect(
      createGitHubActivityReader(async () => response(events, "99"))(claim),
    ).rejects.toThrow("GITHUB_INVALID_PAGINATION");
    for (const link of [
      "https://example.com/repositories/1372162104/events?page=2",
      "https://api.github.com/repositories/1372162104/events?page=9",
      "not-a-url",
    ]) {
      await expect(
        createGitHubActivityReader(
          async () =>
            new Response(JSON.stringify(events), {
              headers: { link: `<${link}>; rel="next"` },
            }),
        )(claim),
      ).rejects.toThrow("GITHUB_INVALID_PAGINATION");
    }
    for (const [page, nextPage] of [
      [1, 1],
      [2, 1],
      [3, 4],
    ]) {
      await expect(
        createGitHubActivityReader(
          async () =>
            new Response(JSON.stringify(events), {
              headers: {
                link: `<https://api.github.com/repositories/1372162104/events?page=${nextPage}>; rel="next"`,
              },
            }),
        )({ ...claim, page: page! }),
      ).rejects.toThrow("GITHUB_INVALID_PAGINATION");
    }
  });
  it("rejects untrusted continuation URLs, oversized bodies and malformed arrays", async () => {
    await expect(
      createGitHubActivityReader(
        async () =>
          new Response("[]", {
            headers: { link: '<https://example.com/?page=2>; rel="next"' },
          }),
      )(claim),
    ).rejects.toThrow("GITHUB_INVALID_PAGINATION");
    await expect(
      createGitHubActivityReader(
        async () => new Response(" ".repeat(2_000_001)),
      )(claim),
    ).rejects.toThrow("GITHUB_RESPONSE_TOO_LARGE");
    await expect(
      createGitHubActivityReader(async () => new Response("{}"))(claim),
    ).rejects.toThrow("GITHUB_INVALID_RESPONSE");
  });
  it("respects retry-after and does not leak response bodies", async () => {
    await expect(
      createGitHubActivityReader(
        async () =>
          new Response("private provider message", {
            status: 429,
            headers: { "retry-after": "600" },
          }),
      )(claim),
    ).rejects.toMatchObject({ code: "GITHUB_RATE_LIMITED", retrySeconds: 600 });
  });
});
