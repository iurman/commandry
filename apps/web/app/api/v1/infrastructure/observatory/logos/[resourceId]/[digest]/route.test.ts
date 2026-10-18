import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { FoundationError } from "@commandry/domain";

const read = vi.hoisted(() => ({
  logo: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("../../../../../../../../lib/observatory", () => ({
  observatoryOwnerRead: read.owner,
}));
// Same status mapping as the shared foundationFailure for these outcomes.
vi.mock("../../../../../../../../lib/foundation-access", () => ({
  foundationFailure: (_request: Request, error: unknown) => {
    const code =
      error instanceof ZodError
        ? "INVALID_INPUT"
        : error instanceof FoundationError
          ? error.code
          : "FOUNDATION_UNAVAILABLE";
    const status =
      { INVALID_INPUT: 400, FORBIDDEN: 403, NOT_FOUND: 404 }[
        code as "INVALID_INPUT"
      ] ?? 503;
    return Response.json({ code }, { status });
  },
}));
const { GET } = await import("./route");

const resourceId = "abcdefab-0000-4000-8000-000000000001";
const digest = "a".repeat(64);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const call = (headers: HeadersInit = {}, id = resourceId, hash = digest) =>
  GET(
    new Request(
      `http://localhost/api/v1/infrastructure/observatory/logos/${id}/${hash}`,
      {
        headers,
      },
    ),
    { params: Promise.resolve({ resourceId: id, digest: hash }) },
  );

describe("approved logo image route", () => {
  beforeEach(() => {
    read.logo.mockReset();
    read.owner.mockReset();
    read.owner.mockResolvedValue({
      service: { logo: read.logo },
      context: { identity: null },
    });
    read.logo.mockResolvedValue({
      schemaVersion: 1,
      scopeDigest: "scope",
      resourceId,
      version: 1,
      image: {
        digest,
        mediaType: "image/png",
        width: 128,
        height: 128,
        dataBase64: png.toString("base64"),
      },
    });
  });

  it("serves the PNG as immutable, non-sniffable, same-origin content", async () => {
    const response = await call({ "sec-fetch-site": "same-origin" });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/png",
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
    });
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(read.logo).toHaveBeenCalledWith(
      { identity: null },
      expect.objectContaining({ resourceId, digest }),
    );
  });

  it.each(["cross-site", "same-site"])(
    "refuses a %s request before reading anything",
    async (site) => {
      const response = await call({ "sec-fetch-site": site });
      expect(response.status).toBe(403);
      expect(read.owner).not.toHaveBeenCalled();
    },
  );

  it("refuses malformed identities before reading", async () => {
    expect((await call({}, "not-a-uuid")).status).toBe(400);
    expect((await call({}, resourceId, "A".repeat(64))).status).toBe(400);
    expect(read.logo).not.toHaveBeenCalled();
  });

  it("passes an unknown digest through as not found", async () => {
    read.logo.mockRejectedValueOnce(new FoundationError("NOT_FOUND"));
    expect((await call()).status).toBe(404);
  });
});
