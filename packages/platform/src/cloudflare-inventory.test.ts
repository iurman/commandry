import { describe, expect, it } from "vitest";
import { cloudflareInventoryEvidenceSchema } from "@commandry/contracts";
import {
  projectProviderInventoryResources,
  type OperationalSourceClaim,
} from "@commandry/application";
import { createCloudflareInventoryReader } from "./cloudflare-inventory";

const account = "a".repeat(32);
const claim: OperationalSourceClaim = {
  id: "inventory",
  leaseId: "lease",
  resourceId: "11111111-1111-4111-8111-111111111111",
  kind: "cloudflare-account",
  externalId: account,
  freshnessSeconds: 900,
  environment: "production",
};
const now = () => new Date("2026-10-18T20:00:00Z");

describe("read-only Cloudflare inventory", () => {
  it("follows every page, scopes zones to the configured account and excludes secrets from safe evidence", async () => {
    const requests: URL[] = [];
    const read = createCloudflareInventoryReader({
      accountId: account,
      token: "private-test-token",
      now,
      fetch: async (raw, options) => {
        const url = new URL(String(raw));
        requests.push(url);
        expect(url.origin).toBe("https://api.cloudflare.com");
        expect(options?.redirect).toBe("error");
        expect(options?.method).toBe("GET");
        expect(options?.headers).toMatchObject({
          Authorization: "Bearer private-test-token",
        });
        if (url.pathname.endsWith("/workers/scripts"))
          return Response.json({
            success: true,
            result: [{ id: "test-worker", secret_text: "PRIVATE_BINDING" }],
          });
        const page = Number(url.searchParams.get("page"));
        if (url.pathname.endsWith("/zones")) {
          expect(url.searchParams.get("account.id")).toBe(account);
          const result = Array.from(
            { length: page === 1 ? 50 : 2 },
            (_, i) => ({
              id: `zone-${(page - 1) * 50 + i}`,
              name: `domain-${(page - 1) * 50 + i}.test`,
              account: { id: account },
              status: "active",
            }),
          );
          return Response.json({
            success: true,
            result,
            result_info: {
              page,
              count: result.length,
              total_pages: 2,
              total_count: 52,
            },
          });
        }
        return Response.json({
          success: true,
          result: [],
          result_info: { page, count: 0, total_pages: 0, total_count: 0 },
        });
      },
    });
    const result = await read(claim);
    const evidence = cloudflareInventoryEvidenceSchema.parse(result.details);
    expect(
      evidence.sections.find((section) => section.kind === "zone")?.items,
    ).toHaveLength(52);
    expect(
      evidence.sections.find((section) => section.kind === "worker")?.items,
    ).toHaveLength(1);
    expect(requests).toHaveLength(6);
    expect(JSON.stringify(evidence)).not.toContain("PRIVATE_BINDING");
    expect(JSON.stringify(result.rawPayload)).toContain("PRIVATE_BINDING");
    expect(JSON.stringify(result)).not.toContain("private-test-token");
    expect(result.signals).toEqual([]);
    const resources = projectProviderInventoryResources(evidence);
    expect(resources).toHaveLength(53);
    expect(resources[0]?.externalKey).toContain(`cloudflare:${account}:`);
  });

  it("qualifies forbidden sections independently and never reports them as an empty complete inventory", async () => {
    const read = createCloudflareInventoryReader({
      accountId: account,
      token: "private",
      now,
      fetch: async (raw) =>
        String(raw).includes("/workers/scripts")
          ? Response.json({ success: true, result: [] })
          : new Response("PRIVATE_ERROR", { status: 403 }),
    });
    const evidence = cloudflareInventoryEvidenceSchema.parse(
      (await read(claim)).details,
    );
    expect(
      evidence.sections.filter((section) => section.state === "inaccessible"),
    ).toHaveLength(4);
    expect(
      evidence.sections
        .filter((section) => section.state === "inaccessible")
        .every((section) => section.complete === false),
    ).toBe(true);
    expect(projectProviderInventoryResources(evidence)).toEqual([]);
  });

  it("rejects a different account before transport and rejects cross-account zone results", async () => {
    let calls = 0;
    const read = createCloudflareInventoryReader({
      accountId: account,
      token: "private",
      now,
      fetch: async (raw) => {
        calls++;
        return Response.json({
          success: true,
          result: String(raw).includes("/zones?")
            ? [
                {
                  id: "other-zone",
                  name: "other.test",
                  account: { id: "b".repeat(32) },
                },
              ]
            : [],
        });
      },
    });
    await expect(
      read({ ...claim, externalId: "b".repeat(32) }),
    ).rejects.toMatchObject({ code: "OPERATIONAL_CONFIGURATION_INVALID" });
    expect(calls).toBe(0);
    const evidence = cloudflareInventoryEvidenceSchema.parse(
      (await read(claim)).details,
    );
    expect(
      evidence.sections.find((section) => section.kind === "zone"),
    ).toMatchObject({ state: "unavailable", complete: false, items: [] });
  });

  it("bounds stalled transport and preserves unavailable source semantics", async () => {
    const read = createCloudflareInventoryReader({
      accountId: account,
      token: "private",
      now,
      timeoutMs: 10,
      fetch: () => new Promise(() => {}),
    });
    await expect(read(claim)).rejects.toMatchObject({
      code: "OPERATIONAL_UNAVAILABLE",
    });
  });

  it("does not accept duplicate or incomplete pagination as a complete account", async () => {
    const read = createCloudflareInventoryReader({
      accountId: account,
      token: "private",
      now,
      fetch: async (raw) =>
        String(raw).includes("/zones?")
          ? Response.json({
              success: true,
              result: [
                { id: "duplicate", name: "a.test", account: { id: account } },
              ],
              result_info: {
                page: 1,
                total_pages: 3,
                total_count: 3,
                count: 1,
              },
            })
          : Response.json({ success: true, result: [] }),
    });
    const evidence = cloudflareInventoryEvidenceSchema.parse(
      (await read(claim)).details,
    );
    expect(
      evidence.sections.find((section) => section.kind === "zone"),
    ).toMatchObject({ state: "unavailable", complete: false, items: [] });
  });
});
