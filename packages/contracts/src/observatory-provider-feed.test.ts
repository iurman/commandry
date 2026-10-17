import { describe, expect, it } from "vitest";
import {
  observatoryPublicProviderSnapshotSchema,
  observatoryProviderFeedQuerySchema,
  observatoryProviderFeedRecordsSchema,
} from "./observatory-provider-feed";
const at = "2026-10-16T12:00:00.000Z";
const snapshot = {
  provider: "cloudflare",
  endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json",
  readAt: at,
  reportedAt: at,
  complete: true,
  components: [],
  notices: [],
};
describe("public provider evidence contract", () => {
  it("requires complete structured collections and rejects transport credentials or authority", () => {
    expect(observatoryPublicProviderSnapshotSchema.parse(snapshot)).toEqual(
      snapshot,
    );
    expect(() =>
      observatoryPublicProviderSnapshotSchema.parse({
        ...snapshot,
        token: "PRIVATE",
      }),
    ).toThrow();
    expect(() =>
      observatoryPublicProviderSnapshotSchema.parse({
        ...snapshot,
        components: undefined,
      }),
    ).toThrow();
    expect(() =>
      observatoryProviderFeedQuerySchema.parse({ owner: true }),
    ).toThrow();
  });
  it("keeps an unavailable feed distinct from an empty successful incident collection", () => {
    const value = {
      state: "unavailable",
      lastSuccessAt: at,
      lastAttemptAt: at,
      lastError: "PROVIDER_TIMEOUT",
      revision: 5,
      snapshot,
      notices: [],
      nextCursor: null,
    };
    expect(observatoryProviderFeedRecordsSchema.parse(value).state).toBe(
      "unavailable",
    );
    expect(() =>
      observatoryProviderFeedRecordsSchema.parse({
        ...value,
        rawPayload: { secret: "PRIVATE" },
      }),
    ).toThrow();
    expect(() =>
      observatoryProviderFeedRecordsSchema.parse({
        ...value,
        nextCursor: "nonexistent",
      }),
    ).toThrow();
  });
});
