import { isIP } from "node:net";
import { SaxesParser } from "saxes";
import { namecheapInventoryEvidenceSchema } from "@commandry/contracts";
import {
  OperationalSourceError,
  validateOperationalSourceClaim,
  type OperationalSourceClaim,
  type OperationalObservation,
} from "@commandry/application";

const command = "namecheap.domains.getList";
const invalid = () =>
  new OperationalSourceError("OPERATIONAL_INVALID_RESPONSE");
type Domain = {
  id: string;
  name: string;
  expires: string;
  autoRenew: boolean;
  expired: boolean;
};

export function parseNamecheapDomainPage(xml: string) {
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = [],
    domains: Domain[] = [];
  const paging: Record<string, string> = {};
  let status = "",
    responseType = "",
    requestedCommand = "";
  let rootCount = 0,
    resultCount = 0,
    pagingCount = 0,
    commandCount = 0;
  parser.on("doctype", () => {
    throw invalid();
  });
  parser.on("opentag", (tag) => {
    stack.push(tag.local);
    const attr = (key: string) => tag.attributes[key]?.value;
    if (tag.local === "ApiResponse") {
      rootCount++;
      status = attr("Status") ?? "";
    }
    if (tag.local === "CommandResponse") {
      if (stack.join("/") !== "ApiResponse/CommandResponse") throw invalid();
      commandCount++;
      responseType = attr("Type") ?? "";
    }
    if (tag.local === "DomainGetListResult") {
      if (stack.join("/") !== "ApiResponse/CommandResponse/DomainGetListResult")
        throw invalid();
      resultCount++;
    }
    if (tag.local === "Paging") {
      if (stack.join("/") !== "ApiResponse/CommandResponse/Paging")
        throw invalid();
      pagingCount++;
    }
    if (tag.local === "Error") throw invalid();
    if (tag.local === "Domain") {
      if (
        stack.join("/") !==
          "ApiResponse/CommandResponse/DomainGetListResult/Domain" ||
        !["", "http://api.namecheap.com/xml.response"].includes(tag.uri)
      )
        throw invalid();
      const id = attr("ID"),
        name = attr("Name"),
        expires = attr("Expires"),
        autoRenew = attr("AutoRenew"),
        expired = attr("IsExpired");
      if (
        !id ||
        !/^\d+$/.test(id) ||
        !name ||
        !/^[a-zA-Z0-9.-]{1,253}$/.test(name) ||
        !expires ||
        !/^(true|false)$/.test(autoRenew ?? "") ||
        !/^(true|false)$/.test(expired ?? "")
      )
        throw invalid();
      domains.push({
        id,
        name,
        expires,
        autoRenew: autoRenew === "true",
        expired: expired === "true",
      });
    }
  });
  parser.on("text", (text) => {
    const key = stack.at(-1);
    if (key === "RequestedCommand") requestedCommand += text;
    if (key && ["TotalItems", "CurrentPage", "PageSize"].includes(key)) {
      if (stack.slice(0, -1).join("/") !== "ApiResponse/CommandResponse/Paging")
        throw invalid();
      paging[key] = (paging[key] ?? "") + text;
    }
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("error", () => {
    throw invalid();
  });
  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof OperationalSourceError) throw error;
    throw invalid();
  }
  if (
    rootCount !== 1 ||
    resultCount !== 1 ||
    pagingCount !== 1 ||
    commandCount !== 1 ||
    status !== "OK" ||
    responseType !== command ||
    (requestedCommand && requestedCommand.trim() !== command)
  )
    throw invalid();
  const integer = (key: string) => {
    const value = paging[key]?.trim();
    if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw invalid();
    return Number(value);
  };
  return {
    domains,
    total: integer("TotalItems"),
    page: integer("CurrentPage"),
    pageSize: integer("PageSize"),
  };
}

function expirationDate(value: string): string {
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!parts) throw invalid();
  const date = `${parts[3]}-${parts[1]}-${parts[2]}`;
  if (
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw invalid();
  return date;
}

/** Fixed domain-list command only. The worker never renews, registers or changes DNS. */
export function createNamecheapInventoryReader(options: {
  username: string;
  apiKey: string;
  clientIp: string;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}): (claim: OperationalSourceClaim) => Promise<OperationalObservation> {
  const timeoutMs = options.timeoutMs ?? 10000;
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(options.username) ||
    !/^[a-fA-F0-9]{32}$/.test(options.apiKey) ||
    isIP(options.clientIp) !== 4 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000
  )
    throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
  const fetcher = options.fetch ?? fetch;
  return async (rawClaim) => {
    const claim = validateOperationalSourceClaim(rawClaim);
    if (claim.kind !== "namecheap-account")
      throw new OperationalSourceError("OPERATIONAL_UNSUPPORTED_SOURCE");
    if (claim.externalId !== options.username)
      throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
    const items: {
      id: string;
      name: string;
      kind: "registration";
      externalUrl: string;
      state: string;
      expirationDate: string;
      autoRenew: boolean;
    }[] = [];
    const originals: string[] = [],
      ids = new Set<string>(),
      names = new Set<string>();
    let page = 1,
      total: number | null = null;
    while (true) {
      const parameters = new URLSearchParams({
        ApiUser: options.username,
        ApiKey: options.apiKey,
        UserName: options.username,
        ClientIp: options.clientIp,
        Command: command,
        PageSize: "100",
        Page: String(page),
        ListType: "ALL",
      });
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new OperationalSourceError("OPERATIONAL_TIMEOUT"));
        }, timeoutMs);
      });
      const request = Promise.resolve().then(() =>
        fetcher(`https://api.namecheap.com/xml.response?${parameters}`, {
          method: "GET",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          headers: { "User-Agent": "Commandry-Namecheap-Inventory/1.0" },
          signal: controller.signal,
        }),
      );
      void request.then(
        (late) => {
          if (controller.signal.aborted)
            void late.body?.cancel().catch(() => {});
        },
        () => {},
      );
      let xml: string;
      try {
        const response = await Promise.race([request, deadline]);
        if (response.status === 401 || response.status === 403)
          throw new OperationalSourceError("OPERATIONAL_UNAUTHORIZED");
        if (!response.ok || !response.body)
          throw new OperationalSourceError("OPERATIONAL_UNAVAILABLE");
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const part = await Promise.race([reader.read(), deadline]);
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 4194304)
              throw new OperationalSourceError(
                "OPERATIONAL_RESPONSE_TOO_LARGE",
              );
            chunks.push(part.value);
          }
        } finally {
          void reader.cancel().catch(() => {});
        }
        xml = new TextDecoder("utf-8", { fatal: true }).decode(
          Buffer.concat(chunks),
        );
      } catch (error) {
        if (error instanceof OperationalSourceError) throw error;
        throw new OperationalSourceError("OPERATIONAL_UNAVAILABLE");
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
      originals.push(xml);
      const parsed = parseNamecheapDomainPage(xml);
      if (
        parsed.page !== page ||
        parsed.pageSize < 1 ||
        parsed.pageSize > 100 ||
        (total !== null && total !== parsed.total) ||
        parsed.domains.length > parsed.pageSize
      )
        throw invalid();
      total = parsed.total;
      for (const domain of parsed.domains) {
        if (ids.has(domain.id) || names.has(domain.name.toLowerCase()))
          throw invalid();
        ids.add(domain.id);
        names.add(domain.name.toLowerCase());
        items.push({
          id: domain.id,
          name: domain.name,
          kind: "registration",
          externalUrl: `https://ap.www.namecheap.com/domains/domaincontrolpanel/${encodeURIComponent(domain.name)}/domain`,
          state: domain.expired ? "expired" : "active",
          expirationDate: expirationDate(domain.expires),
          autoRenew: domain.autoRenew,
        });
      }
      if (items.length === total) break;
      if (items.length > total || parsed.domains.length === 0) throw invalid();
      page++;
    }
    const readAt = (options.now ?? (() => new Date()))().toISOString();
    const details = namecheapInventoryEvidenceSchema.parse({
      provider: "namecheap",
      accountId: options.username,
      readAt,
      sections: [
        {
          kind: "registration",
          state: "available",
          complete: true,
          readAt,
          errorCode: null,
          items,
        },
      ],
    });
    return {
      sourceId: claim.id,
      resourceId: claim.resourceId,
      observedAt: readAt,
      signals: [],
      details,
      rawPayload: { readAt, pages: originals },
    };
  };
}
