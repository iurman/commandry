import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createGitHubRepositoryLogoReader } from "./github-repository-logo";

const commit = "a".repeat(40);
const file = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"/>',
);
const blob = createHash("sha1")
  .update(`blob ${file.byteLength}\0`)
  .update(file)
  .digest("hex");
const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
function github(overrides: Record<string, () => Response> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init: init! });
      const path = new URL(href).pathname + new URL(href).search;
      if (overrides[path]) return overrides[path]();
      if (path === "/repos/iurman/aviune")
        return json({ full_name: "iurman/aviune", default_branch: "main" });
      if (path === "/repos/iurman/aviune/commits/main")
        return new Response(commit + "\n", {
          headers: { "content-type": "application/vnd.github.sha" },
        });
      if (
        path ===
        `/repos/iurman/aviune/contents/public/favicon.svg?ref=${commit}`
      )
        return json({
          type: "file",
          path: "public/favicon.svg",
          encoding: "base64",
          size: file.byteLength,
          sha: blob,
          content: Buffer.from(file)
            .toString("base64")
            .replace(/(.{20})/g, "$1\n"),
        });
      return json({ message: "Not Found" }, 404);
    },
  );
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}
const read = (
  reader: ReturnType<typeof createGitHubRepositoryLogoReader>,
  input: Partial<Parameters<typeof reader.readFile>[0]> = {},
) =>
  reader.readFile({
    repository: "iurman/aviune",
    path: "public/favicon.svg",
    ref: null,
    commitSha: null,
    ...input,
  });
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: { code?: string }) => error.code ?? String(error),
  );

describe("GitHub repository logo reader", () => {
  it("resolves the default branch to a commit and verifies the blob", async () => {
    const { fetch, calls } = github();
    const reader = createGitHubRepositoryLogoReader({
      token: "ghp_test",
      fetch,
    });
    const result = await read(reader);
    expect(result).toEqual({
      bytes: expect.any(Uint8Array),
      commitSha: commit,
      blobSha: blob,
    });
    expect(Buffer.from(result.bytes)).toEqual(Buffer.from(file));
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.github.com/repos/iurman/aviune",
      "https://api.github.com/repos/iurman/aviune/commits/main",
      `https://api.github.com/repos/iurman/aviune/contents/public/favicon.svg?ref=${commit}`,
    ]);
    for (const call of calls) {
      expect(call.init.redirect).toBe("error");
      expect(new Headers(call.init.headers).get("authorization")).toBe(
        "Bearer ghp_test",
      );
    }
  });

  it("reads exactly the pinned commit without resolving a ref", async () => {
    const { fetch, calls } = github();
    const reader = createGitHubRepositoryLogoReader({ fetch });
    await expect(read(reader, { commitSha: commit })).resolves.toMatchObject({
      commitSha: commit,
    });
    expect(calls.some((call) => call.url.includes("/commits/"))).toBe(false);
    expect(new Headers(calls[0]!.init.headers).has("authorization")).toBe(
      false,
    );
  });

  it("refuses content that does not match its git blob identity", async () => {
    const { fetch } = github({
      [`/repos/iurman/aviune/contents/public/favicon.svg?ref=${commit}`]: () =>
        json({
          type: "file",
          path: "public/favicon.svg",
          encoding: "base64",
          size: file.byteLength,
          sha: "f".repeat(40),
          content: Buffer.from(file).toString("base64"),
        }),
    });
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch }), {
          commitSha: commit,
        }),
      ),
    ).toBe("LOGO_SOURCE_UNAVAILABLE");
  });

  it.each([
    ["a directory", [{ type: "file", path: "public/favicon.svg/a" }]],
    [
      "a symlink",
      { type: "symlink", path: "public/favicon.svg", target: "/etc/passwd" },
    ],
    ["a submodule", { type: "submodule", path: "public/favicon.svg" }],
  ])("refuses %s instead of following it", async (_name, body) => {
    const { fetch } = github({
      [`/repos/iurman/aviune/contents/public/favicon.svg?ref=${commit}`]: () =>
        json(body),
    });
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch }), {
          commitSha: commit,
        }),
      ),
    ).toMatch(/LOGO_SOURCE_(NOT_FOUND|UNAVAILABLE)/);
  });

  it("refuses a file larger than the logo input bound", async () => {
    const { fetch } = github({
      [`/repos/iurman/aviune/contents/public/favicon.svg?ref=${commit}`]: () =>
        json({
          type: "file",
          path: "public/favicon.svg",
          encoding: "base64",
          size: 600000,
          sha: blob,
          content: "",
        }),
    });
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch }), {
          commitSha: commit,
        }),
      ),
    ).toBe("LOGO_TOO_LARGE");
  });

  it("separates a hidden repository, a missing path, denial and rate limiting", async () => {
    const hidden = github({
      "/repos/iurman/aviune": () => json({ message: "Not Found" }, 404),
    });
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch: hidden.fetch })),
      ),
    ).toBe("LOGO_SOURCE_UNAUTHORIZED");
    expect(
      await code(
        read(
          createGitHubRepositoryLogoReader({ token: "t", fetch: hidden.fetch }),
        ),
      ),
    ).toBe("LOGO_SOURCE_NOT_FOUND");
    const missing = github();
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch: missing.fetch }), {
          path: "logo.svg",
          commitSha: commit,
        }),
      ),
    ).toBe("LOGO_SOURCE_NOT_FOUND");
    const denied = github({
      "/repos/iurman/aviune": () => json({ message: "Bad credentials" }, 401),
    });
    expect(
      await code(
        read(
          createGitHubRepositoryLogoReader({ token: "t", fetch: denied.fetch }),
        ),
      ),
    ).toBe("LOGO_SOURCE_UNAUTHORIZED");
    const limited = github({
      "/repos/iurman/aviune": () =>
        json({ message: "rate limit" }, 403, { "x-ratelimit-remaining": "0" }),
    });
    expect(
      await code(
        read(
          createGitHubRepositoryLogoReader({
            token: "t",
            fetch: limited.fetch,
          }),
        ),
      ),
    ).toBe("LOGO_SOURCE_UNAVAILABLE");
  });

  it("refuses redirects, oversized bodies and a renamed repository identity", async () => {
    const redirected = github({
      "/repos/iurman/aviune": () => {
        throw new TypeError("redirect mode is set to error");
      },
    });
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch: redirected.fetch })),
      ),
    ).toBe("LOGO_SOURCE_UNAVAILABLE");
    const large = github({
      "/repos/iurman/aviune": () =>
        new Response("{}", { headers: { "content-length": "2000000" } }),
    });
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch: large.fetch })),
      ),
    ).toBe("LOGO_SOURCE_UNAVAILABLE");
    const renamed = github({
      "/repos/iurman/aviune": () =>
        json({ full_name: "someone/other", default_branch: "main" }),
    });
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch: renamed.fetch })),
      ),
    ).toBe("LOGO_SOURCE_UNAVAILABLE");
  });

  it("accepts only a fixed origin and a printable token", () => {
    expect(() =>
      createGitHubRepositoryLogoReader({ baseUrl: "https://evil.example/" }),
    ).toThrow("LOGO_SOURCE_UNAVAILABLE");
    expect(() =>
      createGitHubRepositoryLogoReader({ token: "bad token\n" }),
    ).toThrow("LOGO_SOURCE_UNAVAILABLE");
    expect(() =>
      createGitHubRepositoryLogoReader({
        baseUrl: "http://127.0.0.1:9/",
        allowLoopbackForTests: true,
      }),
    ).not.toThrow();
  });
});

describe("GitHub repository logo reader input and response shape", () => {
  it("reports an impossible repository name as not found without a request", async () => {
    const { fetch, calls } = github();
    expect(
      await code(
        read(createGitHubRepositoryLogoReader({ fetch }), {
          repository: "my_org/app",
        }),
      ),
    ).toBe("LOGO_SOURCE_NOT_FOUND");
    expect(calls).toHaveLength(0);
  });

  it("refuses a JSON endpoint that answers with another content type", async () => {
    const { fetch } = github({
      "/repos/iurman/aviune": () =>
        new Response(
          JSON.stringify({
            full_name: "iurman/aviune",
            default_branch: "main",
          }),
          { headers: { "content-type": "text/html" } },
        ),
    });
    expect(await code(read(createGitHubRepositoryLogoReader({ fetch })))).toBe(
      "LOGO_SOURCE_UNAVAILABLE",
    );
  });
});
