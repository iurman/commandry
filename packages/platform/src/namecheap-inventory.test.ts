import { describe, expect, it } from "vitest";
import type { OperationalSourceClaim } from "@commandry/application";
import { providerInventoryEvidenceSchema } from "@commandry/contracts";
import {
  createNamecheapInventoryReader,
  parseNamecheapDomainPage,
} from "./namecheap-inventory";

const key = "a".repeat(32);
const claim: OperationalSourceClaim = {
  id: "registrar",
  leaseId: "lease",
  resourceId: "11111111-1111-4111-8111-111111111111",
  kind: "namecheap-account",
  externalId: "owner",
  freshnessSeconds: 3600,
  environment: "production",
};
const xml = (page: number, count: number, total: number, start = 0) =>
  `<?xml version="1.0"?><ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response"><Errors/><RequestedCommand>namecheap.domains.getList</RequestedCommand><CommandResponse Type="namecheap.domains.getList"><DomainGetListResult>${Array.from({ length: count }, (_, i) => `<Domain ID="${start + i}" Name="domain-${start + i}.test" Expires="12/15/2026" AutoRenew="${i % 2 === 0}" IsExpired="false"/>`).join("")}</DomainGetListResult><Paging><TotalItems>${total}</TotalItems><CurrentPage>${page}</CurrentPage><PageSize>100</PageSize></Paging></CommandResponse></ApiResponse>`;

describe("fixed Namecheap registration reader", () => {
  it("reads all pages with only the domain-list command and retains date precision", async () => {
    const pages: number[] = [];
    const read = createNamecheapInventoryReader({
      username: "owner",
      apiKey: key,
      clientIp: "192.0.2.10",
      fetch: async (raw, options) => {
        const url = new URL(String(raw));
        const page = Number(url.searchParams.get("Page"));
        pages.push(page);
        expect(url.origin + url.pathname).toBe(
          "https://api.namecheap.com/xml.response",
        );
        expect(url.searchParams.get("Command")).toBe(
          "namecheap.domains.getList",
        );
        expect(url.searchParams.get("ApiKey")).toBe(key);
        expect(url.searchParams.get("ClientIp")).toBe("192.0.2.10");
        expect(options?.redirect).toBe("error");
        return new Response(
          xml(page, page === 1 ? 100 : 2, 102, (page - 1) * 100),
        );
      },
    });
    const result = await read(claim);
    const inventory = providerInventoryEvidenceSchema.parse(result.details);
    expect(pages).toEqual([1, 2]);
    expect(inventory.provider).toBe("namecheap");
    expect(inventory.sections[0]?.items).toHaveLength(102);
    expect(inventory.sections[0]?.items[0]).toMatchObject({
      expirationDate: "2026-12-15",
      autoRenew: true,
      state: "active",
    });
    expect(result.signals).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(key);
  });

  it("rejects a different account before transport", async () => {
    let calls = 0;
    const read = createNamecheapInventoryReader({
      username: "owner",
      apiKey: key,
      clientIp: "192.0.2.10",
      fetch: async () => {
        calls++;
        return new Response(xml(1, 0, 0));
      },
    });
    await expect(
      read({ ...claim, externalId: "different" }),
    ).rejects.toMatchObject({ code: "OPERATIONAL_CONFIGURATION_INVALID" });
    expect(calls).toBe(0);
  });

  it("rejects DTDs, external entities, malformed XML and a response for a different command", () => {
    for (const input of [
      "<!DOCTYPE ApiResponse [<!ENTITY steal SYSTEM 'file:///etc/passwd'>]>" +
        xml(1, 0, 0),
      "<invalid>",
      xml(1, 0, 0).replace("<DomainGetListResult></DomainGetListResult>", ""),
      xml(1, 0, 0)
        .replace("<Paging>", "<Unrelated>")
        .replace("</Paging>", "</Unrelated>"),
      xml(1, 0, 0).replaceAll(
        "namecheap.domains.getList",
        "namecheap.domains.renew",
      ),
    ])
      expect(() => parseNamecheapDomainPage(input)).toThrow();
  });

  it("refuses duplicate pages, changing populations and invalid calendar dates", async () => {
    for (const body of [
      xml(1, 1, 2),
      xml(1, 1, 1).replace("12/15/2026", "02/31/2026"),
    ]) {
      const read = createNamecheapInventoryReader({
        username: "owner",
        apiKey: key,
        clientIp: "192.0.2.10",
        fetch: async () => new Response(body),
      });
      await expect(read(claim)).rejects.toMatchObject({
        code: "OPERATIONAL_INVALID_RESPONSE",
      });
    }
  });

  it("bounds stalled transport and does not expose credentials or provider error text", async () => {
    const read = createNamecheapInventoryReader({
      username: "owner",
      apiKey: key,
      clientIp: "192.0.2.10",
      timeoutMs: 10,
      fetch: () => new Promise(() => {}),
    });
    await expect(read(claim)).rejects.toMatchObject({
      message: "OPERATIONAL_TIMEOUT",
    });
    const denied = createNamecheapInventoryReader({
      username: "owner",
      apiKey: key,
      clientIp: "192.0.2.10",
      fetch: async () =>
        new Response("PRIVATE_PROVIDER_ERROR", { status: 403 }),
    });
    await expect(denied(claim)).rejects.toMatchObject({
      message: "OPERATIONAL_UNAUTHORIZED",
    });
  });
});
