import {
  cloudflareInventoryEvidenceSchema,
  type CloudflareInventoryEvidence,
} from "@commandry/contracts";
import {
  OperationalSourceError,
  validateOperationalSourceClaim,
  type OperationalSourceClaim,
  type OperationalObservation,
} from "@commandry/application";

type Kind = CloudflareInventoryEvidence["sections"][number]["kind"];
const invalid = () =>
  new OperationalSourceError("OPERATIONAL_INVALID_RESPONSE");
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
};
const text = (value: unknown, maximum = 250): string => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw invalid();
  return value;
};

/** Fixed official metadata endpoints, fixed configured account, no script, binding or secret content. */
export function createCloudflareInventoryReader(options: {
  accountId: string;
  token: string;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}): (claim: OperationalSourceClaim) => Promise<OperationalObservation> {
  if (
    !/^[a-f0-9]{32}$/.test(options.accountId) ||
    !/^[!-~]{1,4096}$/.test(options.token)
  )
    throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
  const fetcher = options.fetch ?? fetch;
  const at = () => (options.now ?? (() => new Date()))().toISOString();
  const root = `https://dash.cloudflare.com/${options.accountId}/`;
  async function request(path: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new OperationalSourceError("OPERATIONAL_TIMEOUT"));
      }, timeoutMs);
    });
    let response: Response | undefined;
    const fetchPromise = Promise.resolve().then(() =>
      fetcher(`https://api.cloudflare.com/client/v4/${path}`, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "User-Agent": "Commandry-Cloudflare-Inventory/1.0",
        },
        signal: controller.signal,
      }),
    );
    void fetchPromise.then(
      (late) => {
        if (controller.signal.aborted) void late.body?.cancel().catch(() => {});
      },
      () => {},
    );
    try {
      response = await Promise.race([fetchPromise, deadline]);
      if (response.status === 401 || response.status === 403)
        throw new OperationalSourceError("OPERATIONAL_UNAUTHORIZED");
      if (response.status === 429)
        throw new OperationalSourceError("OPERATIONAL_RATE_LIMITED");
      if (!response.ok)
        throw new OperationalSourceError("OPERATIONAL_UNAVAILABLE");
      if (!response.body) throw invalid();
      const reader = response.body.getReader();
      try {
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const part = await Promise.race([reader.read(), deadline]);
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 4194304)
            throw new OperationalSourceError("OPERATIONAL_RESPONSE_TOO_LARGE");
          chunks.push(part.value);
        }
        const body = Buffer.concat(chunks);
        const value = record(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)),
        );
        if (value.success !== true || !Array.isArray(value.result))
          throw invalid();
        return value;
      } finally {
        void reader.cancel().catch(() => {});
      }
    } catch (error) {
      if (error instanceof OperationalSourceError) throw error;
      throw invalid();
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  const paths: Record<Kind, string> = {
    zone: `zones?account.id=${options.accountId}`,
    worker: `accounts/${options.accountId}/workers/scripts`,
    pages: `accounts/${options.accountId}/pages/projects`,
    tunnel: `accounts/${options.accountId}/cfd_tunnel?is_deleted=false`,
    registration: `accounts/${options.accountId}/registrar/domains`,
  };
  async function section(
    kind: Kind,
    originals: Partial<Record<Kind, unknown[]>>,
  ): Promise<CloudflareInventoryEvidence["sections"][number]> {
    try {
      originals[kind] = [];
      const items: CloudflareInventoryEvidence["sections"][number]["items"] =
        [];
      const seen = new Set<string>();
      let page = 1;
      while (true) {
        const path = paths[kind];
        const result = await request(
          kind === "worker"
            ? path
            : `${path}${path.includes("?") ? "&" : "?"}per_page=50&page=${page}`,
        );
        originals[kind]!.push(result);
        const rows = result.result as unknown[];
        for (const raw of rows) {
          const row = record(raw);
          if (kind === "zone" && record(row.account).id !== options.accountId)
            throw invalid();
          const id = text(row.id ?? row.name);
          if (seen.has(id)) throw invalid();
          seen.add(id);
          const name = text(kind === "worker" ? row.id : row.name, 500);
          const externalUrl =
            kind === "zone"
              ? root + encodeURIComponent(name)
              : kind === "worker"
                ? root +
                  `workers/services/view/${encodeURIComponent(id)}/production`
                : kind === "pages"
                  ? root + `pages/view/${encodeURIComponent(name)}`
                  : kind === "tunnel"
                    ? root + `tunnels/${encodeURIComponent(id)}`
                    : root +
                      `domains/registrations/${encodeURIComponent(name)}`;
          let expirationDate: string | null = null;
          if (
            kind === "registration" &&
            row.expires_at !== undefined &&
            row.expires_at !== null
          ) {
            const rawDate = text(row.expires_at);
            if (!Number.isFinite(Date.parse(rawDate))) throw invalid();
            expirationDate = new Date(rawDate).toISOString();
          }
          items.push({
            id,
            name,
            kind,
            externalUrl,
            state:
              typeof row.status === "string" ? text(row.status, 100) : null,
            expirationDate,
            autoRenew:
              typeof row.auto_renew === "boolean" ? row.auto_renew : null,
          });
        }
        // Scripts is an unpaginated supported endpoint. All other traversals use
        // explicit continuation metadata, or request through an actual empty page.
        if (kind === "worker") break;
        if (result.result_info !== undefined) {
          const info = record(result.result_info);
          if (
            info.page !== page ||
            (info.count !== undefined && info.count !== rows.length)
          )
            throw invalid();
          if (typeof info.total_pages === "number") {
            if (
              !Number.isInteger(info.total_pages) ||
              info.total_pages < 0 ||
              (page > info.total_pages && rows.length > 0)
            )
              throw invalid();
            if (page >= info.total_pages) {
              if (
                typeof info.total_count === "number" &&
                info.total_count !== items.length
              )
                throw invalid();
              break;
            }
          } else if (
            typeof info.total_count === "number" &&
            info.total_count === items.length
          )
            break;
        }
        if (!rows.length) break;
        page++;
      }
      return {
        kind,
        state: "available",
        readAt: at(),
        complete: true,
        errorCode: null,
        items,
      };
    } catch (error) {
      const code =
        error instanceof OperationalSourceError
          ? error.code
          : "OPERATIONAL_INVALID_RESPONSE";
      return {
        kind,
        state:
          code === "OPERATIONAL_UNAUTHORIZED" ? "inaccessible" : "unavailable",
        readAt: at(),
        complete: false,
        errorCode: code,
        items: [],
      };
    }
  }
  return async (rawClaim) => {
    const claim = validateOperationalSourceClaim(rawClaim);
    if (claim.kind !== "cloudflare-account")
      throw new OperationalSourceError("OPERATIONAL_UNSUPPORTED_SOURCE");
    if (claim.externalId !== options.accountId)
      throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
    const originals: Partial<Record<Kind, unknown[]>> = {};
    const sections = await Promise.all(
      (Object.keys(paths) as Kind[]).map((kind) => section(kind, originals)),
    );
    const details = cloudflareInventoryEvidenceSchema.parse({
      provider: "cloudflare",
      accountId: options.accountId,
      readAt: at(),
      sections,
    });
    if (sections.every((value) => value.state !== "available"))
      throw new OperationalSourceError("OPERATIONAL_UNAVAILABLE");
    return {
      sourceId: claim.id,
      resourceId: claim.resourceId,
      observedAt: details.readAt,
      signals: [],
      details,
      rawPayload: {
        accountId: options.accountId,
        readAt: details.readAt,
        sections: originals,
      },
    };
  };
}
