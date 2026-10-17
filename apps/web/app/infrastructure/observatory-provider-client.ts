import {
  observatoryProviderFeedQuerySchema,
  observatoryProviderFeedResultSchema,
  type ObservatorySceneQuery,
} from "@commandry/contracts";
import type { ObservatoryProviderFeedClient } from "@commandry/ui";

/** Same-origin recorded reads. The worker owns provider fetching and credentials. */
export function createObservatoryProviderFeedClient(
  query: ObservatorySceneQuery,
): ObservatoryProviderFeedClient {
  return async (cursor) => {
    const input = observatoryProviderFeedQuerySchema.parse({
      ...query,
      limit: 100,
      cursor,
    });
    const response = await fetch(
      "/api/v1/infrastructure/observatory/provider-feed",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        mode: "same-origin",
        credentials: "same-origin",
        redirect: "error",
      },
    );
    if (!response.ok || response.redirected)
      throw new Error("Recorded provider feed unavailable");
    return observatoryProviderFeedResultSchema.parse(await response.json());
  };
}
