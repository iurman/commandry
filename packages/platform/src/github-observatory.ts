import { createHash } from "node:crypto";
import {
  OperationalSourceError,
  boundedOperationalRetrySeconds,
  validateOperationalSourceClaim,
} from "@commandry/application";
import type {
  OperationalObservation,
  OperationalSourceClaim,
  OperationalSourceErrorCode,
} from "@commandry/application";
import type { ObservatorySignal } from "@commandry/domain";
import {
  observatoryRepositoryEvidenceSchema,
  observatoryRepositoryAlertSchema,
  observatoryRepositoryAnalysisSchema,
  observatoryRepositoryPullRequestSchema,
  observatoryRepositoryCheckRunSchema,
  observatoryRepositoryCommitStatusSchema,
  type ObservatoryRepositoryCheckRunDto,
  type ObservatoryRepositoryCommitStatusDto,
  type ObservatoryRepositoryAlertDto,
  type ObservatoryRepositoryAnalysisDto,
  type ObservatoryRepositoryEvidenceDto,
  type ObservatoryRepositoryPullRequestDto,
} from "@commandry/contracts";

const maximumBytes = 2_097_152;
const invalid = () =>
  new OperationalSourceError("OPERATIONAL_INVALID_RESPONSE");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 1000): string {
  if (typeof value !== "string" || !value.length || value.length > maximum)
    throw invalid();
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw invalid();
  return value;
}
function instant(value: unknown): string {
  const raw = text(value, 100);
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      raw,
    ) ||
    !Number.isFinite(Date.parse(raw)) ||
    new Date(`${raw.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
      raw.slice(0, 10)
  )
    throw invalid();
  return new Date(raw).toISOString();
}
const nullableText = (value: unknown) => (value == null ? null : text(value));
type Repository = { owner: string; name: string; url: string };
function repositoryIdentity(externalId: string): Repository {
  const parts =
    /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\/([a-zA-Z0-9_.-]{1,100})$/.exec(
      externalId,
    );
  if (!parts || parts[1]!.includes("--") || [".", ".."].includes(parts[2]!))
    throw new OperationalSourceError("OPERATIONAL_INVALID_CLAIM");
  return {
    owner: parts[1]!,
    name: parts[2]!,
    url: `https://github.com/${externalId}`,
  };
}
function assertRowIdentity(
  raw: Record<string, unknown>,
  endpoint: string,
  identity: number,
  official: string | null,
): void {
  if (
    raw.url !== undefined &&
    raw.url !== `https://api.github.com${endpoint}/${identity}`
  )
    throw invalid();
  if (
    raw.html_url !== undefined &&
    official !== null &&
    raw.html_url !== official
  )
    throw invalid();
}
function parsePull(
  value: unknown,
  repo: Repository,
  endpoint: string,
): ObservatoryRepositoryPullRequestDto {
  const raw = object(value),
    number = positive(raw.number);
  const base = object(raw.base),
    head = object(raw.head);
  const baseRepo = object(base.repo);
  if (
    baseRepo.full_name !== `${repo.owner}/${repo.name}` ||
    raw.state !== "open" ||
    typeof raw.draft !== "boolean" ||
    typeof raw.title !== "string" ||
    raw.title.length > 10000
  )
    throw invalid();
  const url = `${repo.url}/pull/${number}`;
  assertRowIdentity(raw, endpoint, number, url);
  return observatoryRepositoryPullRequestSchema.parse({
    id: positive(raw.id),
    number,
    title: raw.title,
    draft: raw.draft,
    updatedAt: instant(raw.updated_at),
    baseRef: text(base.ref),
    headRef: text(head.ref),
    headSha:
      typeof head.sha === "string" &&
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(head.sha)
        ? head.sha
        : null,
    requiredCheckCoverage: "unknown",
    author: raw.user === null ? null : text(object(raw.user).login, 100),
    url,
  });
}

function ciFreshness(at: string | null, now: Date, freshnessMs: number) {
  return at === null
    ? ("unknown" as const)
    : Date.parse(at) > now.getTime()
      ? ("future" as const)
      : now.getTime() - Date.parse(at) >= freshnessMs
        ? ("stale" as const)
        : ("fresh" as const);
}
function parseCheckRun(
  value: unknown,
  repo: Repository,
  sha: string,
  now: Date,
  freshnessMs: number,
): ObservatoryRepositoryCheckRunDto {
  const raw = object(value),
    id = positive(raw.id);
  if (
    raw.head_sha !== sha ||
    (raw.repository !== undefined &&
      object(raw.repository).full_name !== repo.owner + "/" + repo.name)
  )
    throw invalid();
  assertRowIdentity(
    raw,
    "/repos/" + repo.owner + "/" + repo.name + "/check-runs",
    id,
    null,
  );
  const startedAt = raw.started_at == null ? null : instant(raw.started_at),
    completedAt = raw.completed_at == null ? null : instant(raw.completed_at);
  return observatoryRepositoryCheckRunSchema.parse({
    id,
    headSha: sha,
    name: text(raw.name),
    status: raw.status,
    conclusion: raw.conclusion ?? null,
    startedAt,
    completedAt,
    freshness: ciFreshness(completedAt ?? startedAt, now, freshnessMs),
    url: repo.url + "/runs/" + id,
  });
}
function parseCommitStatus(
  value: unknown,
  repo: Repository,
  sha: string,
  now: Date,
  freshnessMs: number,
): ObservatoryRepositoryCommitStatusDto {
  const raw = object(value);
  if (
    (raw.sha !== undefined && raw.sha !== sha) ||
    (raw.url !== undefined &&
      raw.url !==
        "https://api.github.com/repos/" +
          repo.owner +
          "/" +
          repo.name +
          "/statuses/" +
          sha)
  )
    throw invalid();
  const createdAt = instant(raw.created_at),
    updatedAt = instant(raw.updated_at);
  return observatoryRepositoryCommitStatusSchema.parse({
    id: positive(raw.id),
    context: text(raw.context),
    state: raw.state,
    createdAt,
    updatedAt,
    freshness: ciFreshness(updatedAt, now, freshnessMs),
    url: repo.url + "/commit/" + sha,
  });
}

function parseAnalysis(
  value: unknown,
  repo: Repository,
  endpoint: string,
  now: Date,
  freshnessMs: number,
): ObservatoryRepositoryAnalysisDto {
  const raw = object(value),
    id = positive(raw.id),
    tool = object(raw.tool);
  const createdAt = instant(raw.created_at),
    ref = text(raw.ref);
  const commitSha = text(raw.commit_sha, 64);
  if (
    !/^[a-f0-9]{40,64}$/i.test(commitSha) ||
    (raw.results_count !== undefined &&
      (typeof raw.results_count !== "number" ||
        !Number.isSafeInteger(raw.results_count) ||
        raw.results_count < 0)) ||
    (raw.error !== undefined && typeof raw.error !== "string") ||
    (raw.warning !== undefined && typeof raw.warning !== "string")
  )
    throw invalid();
  assertRowIdentity(raw, endpoint, id, null);
  return observatoryRepositoryAnalysisSchema.parse({
    id,
    ref,
    commitSha,
    tool: {
      name: text(tool.name),
      version: nullableText(tool.version),
      guid: nullableText(tool.guid),
    },
    createdAt,
    freshness:
      Date.parse(createdAt) > now.getTime()
        ? "future"
        : now.getTime() - Date.parse(createdAt) >= freshnessMs
          ? "stale"
          : "fresh",
    outcome:
      typeof raw.error !== "string"
        ? "unknown"
        : raw.error.length
          ? "error"
          : "completed",
    hasWarnings: typeof raw.warning === "string" && raw.warning.length > 0,
    resultsCount:
      raw.results_count === undefined ? null : (raw.results_count as number),
    url: `${repo.url}/security/code-scanning?query=${encodeURIComponent(`ref:${ref}`)}`,
  });
}
function severity(value: unknown): ObservatoryRepositoryAlertDto["severity"] {
  return typeof value === "string" &&
    ["critical", "high", "medium", "low", "warning", "note", "error"].includes(
      value,
    )
    ? (value as ObservatoryRepositoryAlertDto["severity"])
    : "unknown";
}
function parseAlert(
  value: unknown,
  repo: Repository,
  endpoint: string,
  category: ObservatoryRepositoryAlertDto["category"],
): ObservatoryRepositoryAlertDto {
  const raw = object(value),
    number = positive(raw.number);
  if (raw.state !== "open") throw invalid();
  const path =
    category === "code"
      ? "code-scanning"
      : category === "dependency"
        ? "dependabot"
        : "secret-scanning";
  const url = `${repo.url}/security/${path}/${number}`;
  assertRowIdentity(raw, endpoint, number, url);
  if (raw.repository !== undefined) {
    if (object(raw.repository).full_name !== `${repo.owner}/${repo.name}`)
      throw invalid();
  }
  const rule = category === "code" ? object(raw.rule) : null;
  const advisory =
    category === "dependency" ? object(raw.security_advisory) : null;
  const tool = category === "code" ? object(raw.tool) : null;
  const instance =
    category === "code" && raw.most_recent_instance != null
      ? object(raw.most_recent_instance)
      : null;
  const createdAt = instant(raw.created_at),
    updatedAt = raw.updated_at == null ? null : instant(raw.updated_at);
  if (updatedAt !== null && Date.parse(updatedAt) < Date.parse(createdAt))
    throw invalid();
  return observatoryRepositoryAlertSchema.parse({
    number,
    category,
    severity: severity(
      rule?.security_severity_level ?? rule?.severity ?? advisory?.severity,
    ),
    tool: tool === null ? null : text(tool.name),
    rule: nullableText(
      rule?.id ??
        advisory?.ghsa_id ??
        (category === "secret" ? raw.secret_type : null),
    ),
    state: "open",
    createdAt,
    updatedAt,
    ref: instance?.ref == null ? null : text(instance.ref),
    url,
  });
}
function validatePrivatePayload(
  payload: unknown,
  token: string | undefined,
  initialDepth = 3,
): void {
  // The shared poller allows objects through observation depth 64. A raw page
  // sits at depth 3: observation -> rawPayload -> component pages -> page.
  // CI pages start at depth 5 after the pullRequestChecks and exact-head wrappers.
  // Validate the original JSON tree before retaining any page of its component.
  const pending: { value: unknown; depth: number }[] = [
    { value: payload, depth: initialDepth },
  ];
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (typeof value === "string") {
      if (token !== undefined && value.includes(token)) throw invalid();
      continue;
    }
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      continue;
    if (typeof value !== "object" || depth > 64) throw invalid();
    for (const [key, entry] of Object.entries(value)) {
      if (
        (token !== undefined && key.includes(token)) ||
        (/^(secret|secretvalue|secretliteral|literalsecret)$/.test(
          key.replace(/[_-]/g, "").toLowerCase(),
        ) &&
          entry !== null &&
          entry !== "")
      )
        throw invalid();
      pending.push({ value: entry, depth: depth + 1 });
    }
  }
}
async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    /* Transport data stays private. */
  }
}
function retrySeconds(response: Response, now: Date): number {
  const raw = response.headers.get("retry-after");
  return boundedOperationalRetrySeconds(
    raw && /^\d+$/.test(raw)
      ? Number.isFinite(Number(raw))
        ? Number(raw)
        : 86400
      : raw
        ? Math.ceil((Date.parse(raw) - now.getTime()) / 1000)
        : 60,
  );
}
function continuation(
  header: string | null,
  endpoint: URL,
  currentPage: number,
): number | null {
  if (header === null) return null;
  const relations = new Map<string, number>();
  for (const part of header.split(",")) {
    const match = /^\s*<([^<>]+)>\s*;\s*rel="(next|prev|first|last)"\s*$/.exec(
      part,
    );
    if (!match || relations.has(match[2]!)) throw invalid();
    const next = new URL(match[1]!);
    if (
      next.origin !== endpoint.origin ||
      next.username ||
      next.password ||
      next.hash ||
      next.pathname !== endpoint.pathname ||
      /[\\\s]/.test(match[1]!)
    )
      throw invalid();
    const expected = new URLSearchParams(endpoint.search);
    expected.delete("page");
    const params = new URLSearchParams(next.search),
      rawPage = params.get("page");
    if (
      params.getAll("page").length !== 1 ||
      !rawPage ||
      !/^[1-9]\d*$/.test(rawPage) ||
      !Number.isSafeInteger(Number(rawPage))
    )
      throw invalid();
    params.delete("page");
    if (
      [...params].length !== [...expected].length ||
      [...expected].some(
        ([key, value]) =>
          params.getAll(key).length !== 1 || params.get(key) !== value,
      ) ||
      [...params.keys()].some((key) => !expected.has(key))
    )
      throw invalid();
    relations.set(match[2]!, Number(rawPage));
  }
  const next = relations.get("next") ?? null,
    last = relations.get("last");
  if (
    (next !== null && next !== currentPage + 1) ||
    (last !== undefined &&
      (last < currentPage ||
        (next === null && last > currentPage) ||
        (next !== null && last < next)))
  )
    throw invalid();
  return next;
}
type Component<T> = {
  state:
    | "available"
    | "inaccessible"
    | "unavailable"
    | "disabled_or_not_found"
    | "unsupported";
  readAt: string;
  complete: boolean;
  items: T[];
  errorCode: Exclude<
    OperationalSourceErrorCode,
    | "OPERATIONAL_INVALID_CLAIM"
    | "OPERATIONAL_INVALID_OBSERVATION"
    | "OPERATIONAL_CONFIGURATION_INVALID"
  > | null;
  retrySeconds: number | null;
};
type ReadResult<T> = { evidence: Component<T>; raw: unknown[] | null };

/** Server-owned read adapter. Callers cannot change its origin, credential or endpoints. */
export function createGitHubObservatoryReader(
  options: {
    token?: string;
    fetch?: typeof fetch;
    now?: () => Date;
    timeoutMs?: number;
    baseUrl?: string;
    allowLoopbackForTests?: boolean;
  } = {},
) {
  let origin = "https://api.github.com";
  const token = options.token,
    timeoutMs = options.timeoutMs ?? 10000;
  try {
    if (
      (token !== undefined && !/^[\x21-\x7e]{1,4096}$/.test(token)) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 10000
    )
      throw new Error();
    if (options.baseUrl !== undefined) {
      const base = new URL(options.baseUrl);
      if (
        /[\s\\]/.test(options.baseUrl) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
        options.allowLoopbackForTests !== true ||
        !["https:", "http:"].includes(base.protocol) ||
        base.pathname !== "/" ||
        base.search ||
        base.hash ||
        base.username ||
        base.password
      )
        throw new Error();
      origin = base.origin;
    }
  } catch {
    throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
  }
  const fetcher = options.fetch ?? fetch,
    clock = options.now ?? (() => new Date());
  function now(): Date {
    const at = clock();
    if (!(at instanceof Date) || !Number.isFinite(at.getTime()))
      throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
    return at;
  }
  async function page(
    url: URL,
    privateDepth = 3,
  ): Promise<{ payload: unknown; next: number | null }> {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetcher(url.href, {
        method: "GET",
        redirect: "error",
        signal,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "Accept-Encoding": "identity",
          ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
        },
      });
    } catch {
      throw new OperationalSourceError(
        signal.aborted ? "OPERATIONAL_TIMEOUT" : "OPERATIONAL_UNAVAILABLE",
      );
    }
    if (
      response.redirected ||
      (response.url && response.url !== url.href) ||
      response.status !== 200
    ) {
      const retry = retrySeconds(response, now());
      const code =
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("retry-after") !== null ||
            response.headers.get("x-ratelimit-remaining") === "0"))
          ? "OPERATIONAL_RATE_LIMITED"
          : response.status === 401 || response.status === 403
            ? "OPERATIONAL_UNAUTHORIZED"
            : response.status === 404
              ? "OPERATIONAL_NOT_FOUND"
              : "OPERATIONAL_UNAVAILABLE";
      await discard(response);
      throw new OperationalSourceError(code, retry);
    }
    if (
      !/^application\/(?:json|vnd\.github\+json)(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      await discard(response);
      throw invalid();
    }
    const length = response.headers.get("content-length");
    if (length !== null && !/^\d+$/.test(length)) {
      await discard(response);
      throw invalid();
    }
    if (length !== null && Number(length) > maximumBytes) {
      await discard(response);
      throw new OperationalSourceError("OPERATIONAL_RESPONSE_TOO_LARGE");
    }
    const reader = response.body?.getReader();
    if (!reader) throw invalid();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maximumBytes)
          throw new OperationalSourceError("OPERATIONAL_RESPONSE_TOO_LARGE");
        chunks.push(part.value);
      }
      if (
        length !== null &&
        !response.headers.get("content-encoding") &&
        size !== Number(length)
      )
        throw invalid();
      const payload: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
      validatePrivatePayload(payload, token, privateDepth);
      return {
        payload,
        next: continuation(
          response.headers.get("link"),
          url,
          Number(url.searchParams.get("page")),
        ),
      };
    } catch (error) {
      if (error instanceof OperationalSourceError) throw error;
      throw signal.aborted
        ? new OperationalSourceError("OPERATIONAL_TIMEOUT")
        : invalid();
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* No provider exception escapes cleanup. */
      }
    }
  }
  async function component<T>(
    endpoint: URL,
    parse: (value: unknown) => T,
    identity: (item: T) => readonly string[],
    envelope?: {
      rows: (payload: unknown) => { rows: unknown[]; total?: number };
      privateDepth: number;
    },
  ): Promise<ReadResult<T>> {
    const items: T[] = [],
      raw: unknown[] = [],
      ids = new Set<string>(),
      visited = new Set<number>();
    let pageNumber: number | null = 1;
    let expectedTotal: number | undefined;
    try {
      while (pageNumber !== null) {
        if (visited.has(pageNumber)) throw invalid();
        visited.add(pageNumber);
        const url = new URL(endpoint);
        url.searchParams.set("page", String(pageNumber));
        const result = await page(url, envelope?.privateDepth ?? 3);
        const extracted = envelope?.rows(result.payload);
        const rows = extracted?.rows ?? result.payload;
        if (extracted?.total !== undefined) {
          if (expectedTotal !== undefined && extracted.total !== expectedTotal)
            throw invalid();
          expectedTotal = extracted.total;
        }
        if (
          !Array.isArray(rows) ||
          rows.length > 100 ||
          (result.next !== null && rows.length !== 100)
        )
          throw invalid();
        for (const row of rows) {
          const item = parse(row),
            rowIds = identity(item);
          if (rowIds.some((id) => ids.has(id))) throw invalid();
          for (const id of rowIds) ids.add(id);
          items.push(item);
        }
        if (
          expectedTotal !== undefined &&
          (items.length > expectedTotal ||
            (result.next === null && items.length !== expectedTotal))
        )
          throw invalid();
        raw.push(result.payload);
        pageNumber = result.next;
      }
      return {
        evidence: {
          state: "available",
          readAt: now().toISOString(),
          complete: true,
          items,
          errorCode: null,
          retrySeconds: null,
        },
        raw,
      };
    } catch (error) {
      const safe = error instanceof OperationalSourceError ? error : invalid();
      if (
        [
          "OPERATIONAL_CONFIGURATION_INVALID",
          "OPERATIONAL_INVALID_CLAIM",
          "OPERATIONAL_INVALID_OBSERVATION",
        ].includes(safe.code)
      )
        throw safe;
      return {
        evidence: {
          state:
            safe.code === "OPERATIONAL_UNAUTHORIZED"
              ? "inaccessible"
              : safe.code === "OPERATIONAL_NOT_FOUND"
                ? "disabled_or_not_found"
                : safe.code === "OPERATIONAL_UNSUPPORTED_SOURCE"
                  ? "unsupported"
                  : "unavailable",
          readAt: now().toISOString(),
          complete: false,
          items: [],
          errorCode: safe.code as Component<T>["errorCode"],
          retrySeconds: safe.retrySeconds,
        },
        raw: null,
      };
    }
  }
  return async (
    rawClaim: OperationalSourceClaim,
  ): Promise<OperationalObservation> => {
    const claim = validateOperationalSourceClaim(rawClaim);
    if (claim.kind !== "github-repository")
      throw new OperationalSourceError("OPERATIONAL_UNSUPPORTED_SOURCE");
    const repo = repositoryIdentity(claim.externalId),
      at = now();
    const prefix = `/repos/${repo.owner}/${repo.name}`;
    const endpoint = (path: string, filters: Record<string, string> = {}) => {
      const url = new URL(`${prefix}/${path}`, origin);
      for (const [key, value] of Object.entries(filters))
        url.searchParams.set(key, value);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", "1");
      return url;
    };
    const [pullRequests, analyses, code, dependency, secret] =
      await Promise.all([
        component(
          endpoint("pulls", { state: "open" }),
          (row) => parsePull(row, repo, `${prefix}/pulls`),
          (row) => [`id:${row.id}`, `number:${row.number}`],
        ),
        component(
          endpoint("code-scanning/analyses"),
          (row) =>
            parseAnalysis(
              row,
              repo,
              `${prefix}/code-scanning/analyses`,
              at,
              claim.freshnessSeconds * 1000,
            ),
          (row) => [String(row.id)],
        ),
        component(
          endpoint("code-scanning/alerts", { state: "open" }),
          (row) =>
            parseAlert(row, repo, `${prefix}/code-scanning/alerts`, "code"),
          (row) => [String(row.number)],
        ),
        component(
          endpoint("dependabot/alerts", { state: "open" }),
          (row) =>
            parseAlert(row, repo, `${prefix}/dependabot/alerts`, "dependency"),
          (row) => [String(row.number)],
        ),
        component(
          endpoint("secret-scanning/alerts", {
            state: "open",
            hide_secret: "true",
          }),
          (row) =>
            parseAlert(row, repo, `${prefix}/secret-scanning/alerts`, "secret"),
          (row) => [String(row.number)],
        ),
      ]);
    // Four head workers bound fan-out; each head has two independent source reads.
    // Shared SHAs are read once. No PR, head or result population is truncated.
    const heads = [
      ...new Set(
        pullRequests.evidence.items.flatMap((pull) =>
          pull.headSha ? [pull.headSha] : [],
        ),
      ),
    ];
    const headResults = new Map<
      string,
      {
        checkRuns: ReadResult<ObservatoryRepositoryCheckRunDto>;
        statuses: ReadResult<ObservatoryRepositoryCommitStatusDto>;
      }
    >();
    let nextHead = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, heads.length) }, async () => {
        while (nextHead < heads.length) {
          const sha = heads[nextHead++]!;
          const [checkRuns, statuses] = await Promise.all([
            component(
              endpoint("commits/" + sha + "/check-runs", { filter: "latest" }),
              (row) =>
                parseCheckRun(
                  row,
                  repo,
                  sha,
                  at,
                  claim.freshnessSeconds * 1000,
                ),
              (row) => [String(row.id)],
              {
                privateDepth: 5,
                rows(payload) {
                  const wrapper = object(payload),
                    total = wrapper.total_count;
                  if (
                    typeof total !== "number" ||
                    !Number.isSafeInteger(total) ||
                    total < 0 ||
                    !Array.isArray(wrapper.check_runs)
                  )
                    throw invalid();
                  return { rows: wrapper.check_runs, total };
                },
              },
            ),
            component(
              endpoint("commits/" + sha + "/statuses"),
              (row) =>
                parseCommitStatus(
                  row,
                  repo,
                  sha,
                  at,
                  claim.freshnessSeconds * 1000,
                ),
              (row) => [String(row.id)],
              {
                privateDepth: 5,
                rows(payload) {
                  if (!Array.isArray(payload)) throw invalid();
                  return { rows: payload };
                },
              },
            ),
          ]);
          // Assess all pages against the completed component read, never the
          // earlier poll start. Keep original result and security clocks intact.
          const checksReadAt = new Date(checkRuns.evidence.readAt),
            statusesReadAt = new Date(statuses.evidence.readAt);
          checkRuns.evidence.items = checkRuns.evidence.items.map((run) => ({
            ...run,
            freshness: ciFreshness(
              run.completedAt ?? run.startedAt,
              checksReadAt,
              claim.freshnessSeconds * 1000,
            ),
          }));
          statuses.evidence.items = statuses.evidence.items.map((status) =>
            observatoryRepositoryCommitStatusSchema.parse({
              ...status,
              freshness: ciFreshness(
                status.updatedAt,
                statusesReadAt,
                claim.freshnessSeconds * 1000,
              ),
            }),
          );
          headResults.set(sha, { checkRuns, statuses });
        }
      }),
    );
    const unknownHead = () => ({
      headSha: null,
      state: "unsupported" as const,
      readAt: now().toISOString(),
      complete: false,
      items: [],
      errorCode: "OPERATIONAL_UNSUPPORTED_SOURCE" as const,
      retrySeconds: 60,
    });
    pullRequests.evidence.items = pullRequests.evidence.items.map((pull) => {
      const result = pull.headSha ? headResults.get(pull.headSha) : undefined;
      return {
        ...pull,
        checkRuns: result
          ? { ...result.checkRuns.evidence, headSha: pull.headSha! }
          : unknownHead(),
        statuses: result
          ? { ...result.statuses.evidence, headSha: pull.headSha! }
          : unknownHead(),
      };
    });
    const parsed = observatoryRepositoryEvidenceSchema.safeParse({
      schemaVersion: 1,
      repository: repo,
      readAt: now().toISOString(),
      pullRequests: pullRequests.evidence,
      security: {
        codeScanning: {
          analyses: analyses.evidence,
          alerts: code.evidence,
          currentHeadCoverage: "unknown",
        },
        dependabot: dependency.evidence,
        secretScanning: secret.evidence,
      },
    });
    if (!parsed.success) throw invalid();
    const evidence: ObservatoryRepositoryEvidenceDto = parsed.data;
    const signals: ObservatorySignal[] = [];
    function add(
      identity: unknown[],
      state: "findings" | "zero_findings",
      observedAt: string,
      href: string,
    ): void {
      if (Date.parse(observedAt) > at.getTime()) return;
      const digest = createHash("sha256")
        .update(JSON.stringify([claim.id, ...identity, state, observedAt]))
        .digest("hex");
      signals.push({
        id: `github-security:${digest}`,
        resourceId: claim.resourceId,
        facet: "security",
        state,
        sourceId: claim.id,
        observedAt,
        freshnessMs: claim.freshnessSeconds * 1000,
        evidenceRefs: [href],
        environment: claim.environment,
        incidentId: null,
      });
    }
    for (const source of [
      evidence.security.codeScanning.alerts,
      evidence.security.dependabot,
      evidence.security.secretScanning,
    ]) {
      for (const alert of source.items)
        add(
          [alert.category, alert.number, alert.ref],
          "findings",
          alert.updatedAt ?? alert.createdAt,
          alert.url,
        );
    }
    if (evidence.security.codeScanning.alerts.complete) {
      const latest = new Map<
        string,
        { analysis: ObservatoryRepositoryAnalysisDto; qualifies: boolean }
      >();
      for (const analysis of evidence.security.codeScanning.analyses.items) {
        const key = JSON.stringify([
          analysis.ref,
          analysis.tool.guid ?? analysis.tool.name,
        ]);
        const previous = latest.get(key);
        const qualifies =
          analysis.outcome === "completed" &&
          !analysis.hasWarnings &&
          analysis.resultsCount === 0;
        if (!previous || analysis.createdAt > previous.analysis.createdAt)
          latest.set(key, { analysis, qualifies });
        else if (analysis.createdAt === previous.analysis.createdAt)
          latest.set(key, {
            analysis:
              analysis.id < previous.analysis.id ? analysis : previous.analysis,
            qualifies:
              previous.qualifies &&
              qualifies &&
              analysis.commitSha === previous.analysis.commitSha,
          });
      }
      const blocked = new Set<string>();
      let unscopedFinding = false;
      for (const alert of evidence.security.codeScanning.alerts.items) {
        if (alert.ref === null || alert.tool === null) unscopedFinding = true;
        else blocked.add(JSON.stringify([alert.ref, alert.tool]));
      }
      for (const { analysis, qualifies } of latest.values()) {
        if (
          qualifies &&
          !unscopedFinding &&
          !blocked.has(JSON.stringify([analysis.ref, analysis.tool.name]))
        )
          add(
            [
              "analysis",
              analysis.id,
              analysis.ref,
              analysis.commitSha,
              analysis.tool,
            ],
            "zero_findings",
            analysis.createdAt,
            analysis.url,
          );
      }
    }
    const observedAt =
      signals
        .map((signal) => signal.observedAt)
        .sort()
        .at(-1) ?? null;
    return {
      sourceId: claim.id,
      resourceId: claim.resourceId,
      observedAt,
      signals,
      details: {
        sourceState: signals.length ? "available" : "unknown",
        reason: signals.length ? "observed" : "no_observation",
        repository: evidence,
      },
      rawPayload: {
        pullRequests: pullRequests.raw,
        codeScanningAnalyses: analyses.raw,
        codeScanningAlerts: code.raw,
        dependabot: dependency.raw,
        secretScanning: secret.raw,
        ...(heads.length
          ? {
              pullRequestChecks: Object.fromEntries(
                [...headResults].map(([sha, result]) => [
                  sha,
                  {
                    checkRuns: result.checkRuns.raw,
                    statuses: result.statuses.raw,
                  },
                ]),
              ),
            }
          : {}),
      },
    };
  };
}
