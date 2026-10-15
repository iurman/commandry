import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: {
    humanAuthMode: "off",
    appOrigin: "https://commandry.test",
    initialAdminEmail: "owner@commandry.test",
    localAuthTrustedOrigin: undefined as string | undefined,
  },
  session: vi.fn(),
}));
vi.mock("@commandry/config", () => ({ loadRuntimeConfig: () => mocks.config }));
vi.mock("./auth", () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock("./database", () => ({ getDatabase: vi.fn() }));
import { knowledgeOwner } from "./knowledge-access";

describe("knowledge credential owner boundary", () => {
  beforeEach(() => {
    mocks.config.humanAuthMode = "off";
    mocks.session.mockReset();
  });
  it("fails closed in unauthenticated local-review mode", async () => {
    await expect(
      knowledgeOwner(
        new Request("https://commandry.test/api/v1/knowledge-clients"),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("requires the owner and rejects an untrusted browser origin", async () => {
    mocks.config.humanAuthMode = "password";
    mocks.session.mockResolvedValue({
      user: { id: "other", email: "other@commandry.test" },
    });
    await expect(
      knowledgeOwner(new Request("https://commandry.test")),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    mocks.session.mockResolvedValue({
      user: { id: "owner", email: "owner@commandry.test" },
    });
    await expect(
      knowledgeOwner(
        new Request("https://commandry.test", {
          headers: { origin: "https://other.test" },
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      knowledgeOwner(
        new Request("https://commandry.test", {
          headers: { origin: "https://commandry.test" },
        }),
      ),
    ).resolves.toBe("user:owner");
  });
});
