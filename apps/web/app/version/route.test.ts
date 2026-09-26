import { describe, expect, it, vi } from "vitest";

vi.mock("@commandry/config", () => ({
  loadRuntimeConfig: () => ({
    appEnv: "local",
    releaseSha: "test-sha",
    releaseImageDigest: "sha256:test-digest",
    releaseBuildTime: "2026-09-25T12:00:00Z",
  }),
}));

import { GET } from "./route";

describe("GET /version", () => {
  it("returns release and schema compatibility metadata", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const response = GET(new Request("http://127.0.0.1:3000/version"));

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        sha: "test-sha",
        imageDigest: "sha256:test-digest",
        buildTime: "2026-09-25T12:00:00Z",
        schemaCompatibility: "1",
        environment: "local",
      });
    } finally {
      log.mockRestore();
    }
  });
});
