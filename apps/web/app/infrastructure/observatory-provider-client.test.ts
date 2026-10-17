import { afterEach, expect, it, vi } from "vitest";
import { observatorySceneQuerySchema } from "@commandry/contracts";
import { createObservatoryProviderFeedClient } from "./observatory-provider-client";

afterEach(() => vi.unstubAllGlobals());
const query = observatorySceneQuerySchema.parse({});
const emptyFeed = {
  schemaVersion: 1,
  scopeDigest: "authorized-scope",
  projectionRevision: "revision",
  population: "recorded_provider_notices",
  feed: {
    state: "unknown",
    revision: 0,
    lastSuccessAt: null,
    lastAttemptAt: null,
    lastError: null,
    snapshot: null,
  },
  items: [],
  nextCursor: null,
};
it("requires same-origin transport, rejects redirects and sends only the canonical read query", async () => {
  const transport = vi.fn(async () => Response.json(emptyFeed));
  vi.stubGlobal("fetch", transport);
  await expect(
    createObservatoryProviderFeedClient(query)(null),
  ).resolves.toEqual(emptyFeed);
  expect(transport).toHaveBeenCalledWith(
    "/api/v1/infrastructure/observatory/provider-feed",
    expect.objectContaining({
      method: "POST",
      cache: "no-store",
      mode: "same-origin",
      credentials: "same-origin",
      redirect: "error",
      body: JSON.stringify({ ...query, limit: 100, cursor: null }),
    }),
  );
});
it("withholds an otherwise valid response marked as redirected", async () => {
  const response = Response.json(emptyFeed);
  Object.defineProperty(response, "redirected", { value: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
  await expect(
    createObservatoryProviderFeedClient(query)(null),
  ).rejects.toThrow("Recorded provider feed unavailable");
});
