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
