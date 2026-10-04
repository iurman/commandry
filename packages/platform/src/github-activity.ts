import {
  RealProviderError,
  type GitHubActivityPage,
  type RealPollClaim,
} from "@commandry/application";

async function limitedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new RealProviderError("GITHUB_INVALID_RESPONSE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000)
        throw new RealProviderError("GITHUB_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createGitHubActivityReader(fetcher: typeof fetch = fetch) {
  return async (claim: RealPollClaim): Promise<GitHubActivityPage> => {
    // The URL is derived from a validated repository identity. Provider redirects are refused.
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(
        claim.identifier,
      ) ||
      claim.page < 1 ||
      claim.page > 3
    )
      throw new RealProviderError("GITHUB_INVALID_SCOPE");
    const path = `/repos/${claim.identifier}/events`;
    const response = await fetcher(
      `https://api.github.com${path}?per_page=100&page=${claim.page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "Commandry-readonly-activity",
          ...(claim.page === 1 && claim.etag
            ? { "If-None-Match": claim.etag }
            : {}),
        },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    const pollValue = Number(response.headers.get("x-poll-interval"));
    const pollSeconds = Number.isFinite(pollValue)
      ? Math.max(60, pollValue)
      : 60;
    if (response.status === 403 || response.status === 429) {
      const retry = response.headers.get("retry-after");
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const retrySeconds = retry
        ? /^\d+$/.test(retry)
          ? Number(retry)
          : Math.ceil((Date.parse(retry) - Date.now()) / 1000)
        : reset > 0
          ? reset - Math.floor(Date.now() / 1000)
          : 300;
      throw new RealProviderError(
        "GITHUB_RATE_LIMITED",
        Math.max(
          pollSeconds,
          Number.isFinite(retrySeconds) ? retrySeconds : 300,
        ),
      );
    }
    if (response.status === 304)
      return {
        events: [],
        notModified: true,
        etag: claim.etag,
        hasNext: false,
        pollSeconds,
      };
    if (!response.ok)
      throw new RealProviderError(
        response.status === 404
          ? "GITHUB_REPOSITORY_UNAVAILABLE"
          : "GITHUB_PROVIDER_UNAVAILABLE",
      );
    const events = await limitedJson(response);
    if (!Array.isArray(events) || events.length > 100)
      throw new RealProviderError("GITHUB_INVALID_RESPONSE");
    const links = response.headers.get("link") ?? "";
    const nextLink = links.split(",").find((link) => /rel="next"/.test(link));
    if (nextLink) {
      const target = /<([^>]+)>/.exec(nextLink)?.[1];
      const next = target ? new URL(target) : null;
      if (
        !next ||
        next.origin !== "https://api.github.com" ||
        next.pathname.toLowerCase() !== path.toLowerCase() ||
        next.searchParams.get("page") !== String(claim.page + 1) ||
        claim.page >= 3
      )
        throw new RealProviderError("GITHUB_INVALID_PAGINATION");
    }
    return {
      events,
      notModified: false,
      etag: response.headers.get("etag"),
      hasNext: Boolean(nextLink),
      pollSeconds,
    };
  };
}
