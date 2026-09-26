import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../../../lib/database", () => ({
  getDatabase: () => ({ pool: { query } }),
}));

import { GET } from "./route";

describe("GET /health/ready", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("reports ready only after a successful database probe", async () => {
    query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const response = await GET(
        new Request("http://127.0.0.1:3000/health/ready"),
      );

      expect(query).toHaveBeenCalledExactlyOnceWith("SELECT 1");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        status: "ready",
        service: "web",
        database: "ready",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("returns an unavailable response when the database probe fails", async () => {
    query.mockRejectedValueOnce(new Error("database unavailable"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const response = await GET(
        new Request("http://127.0.0.1:3000/health/ready"),
      );

      expect(query).toHaveBeenCalledExactlyOnceWith("SELECT 1");
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        status: "not_ready",
        service: "web",
        database: "unavailable",
      });
    } finally {
      log.mockRestore();
    }
  });
});
