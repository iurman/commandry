import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /health/live", () => {
  it("reports process liveness without a database dependency", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const response = GET(
        new Request("http://127.0.0.1:3000/health/live", {
          headers: { "x-correlation-id": "live-probe-1" },
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-correlation-id")).toBe("live-probe-1");
      expect(await response.json()).toEqual({
        status: "alive",
        service: "web",
      });
    } finally {
      log.mockRestore();
    }
  });
});
