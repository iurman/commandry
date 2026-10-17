import { describe, expect, it } from "vitest";
import {
  observatoryRepositoryEvidenceSchema,
  observatoryRepositorySourceStateSchema,
  type ObservatoryRepositoryEvidenceDto,
} from "./observatory-repository";

const at = "2026-10-17T12:00:00.000Z";
const empty = () => ({
  state: "available" as const,
  readAt: at,
  complete: true,
  items: [],
  errorCode: null,
  retrySeconds: null,
});
function evidence(): ObservatoryRepositoryEvidenceDto {
  return {
    schemaVersion: 1,
    repository: {
      owner: "synthetic-owner",
      name: "repository",
      url: "https://github.com/synthetic-owner/repository",
    },
    readAt: at,
    pullRequests: empty(),
    security: {
      codeScanning: {
        analyses: empty(),
        alerts: empty(),
        currentHeadCoverage: "unknown",
      },
      dependabot: empty(),
      secretScanning: empty(),
    },
  };
}
const pull = {
  id: 12,
  number: 3,
  title: "<script>literal text</script>",
  draft: true,
  updatedAt: at,
  baseRef: "main",
  headRef: "feature",
  author: "dependabot[bot]",
  url: "https://github.com/synthetic-owner/repository/pull/3",
};
const alert = {
  number: 5,
  category: "secret" as const,
  severity: "unknown" as const,
  tool: null,
  rule: "generic_api_key",
  state: "open" as const,
  createdAt: at,
  updatedAt: null,
  ref: null,
  url: "https://github.com/synthetic-owner/repository/security/secret-scanning/5",
};
describe("strict derived repository evidence", () => {
  it("accepts complete empty supported lists without inventing a scan or current-head coverage", () => {
    const dto = evidence();
    expect(observatoryRepositoryEvidenceSchema.parse(dto)).toEqual(dto);
    expect(dto.security.codeScanning.currentHeadCoverage).toBe("unknown");
    expect(dto.security.codeScanning.analyses.items).toEqual([]);
  });
  it.each([
    ["available", null, true],
    ["inaccessible", "OPERATIONAL_UNAUTHORIZED", false],
    ["unavailable", "OPERATIONAL_RATE_LIMITED", false],
    ["disabled_or_not_found", "OPERATIONAL_NOT_FOUND", false],
    ["unsupported", "OPERATIONAL_UNSUPPORTED_SOURCE", false],
  ] as const)(
    "validates the independent %s source state",
    (state, errorCode, complete) => {
      const dto = evidence();
      dto.security.secretScanning = {
        ...empty(),
        state,
        errorCode,
        complete,
        retrySeconds: complete ? null : 60,
      };
      expect(observatoryRepositorySourceStateSchema.parse(state)).toBe(state);
      expect(observatoryRepositoryEvidenceSchema.parse(dto)).toEqual(dto);
      expect(dto.pullRequests.complete).toBe(true);
    },
  );
  it("retains malicious titles literally, safe alert categories, actual scan ref and observation date", () => {
    const dto = evidence();
    dto.pullRequests.items.push(pull);
    dto.security.secretScanning.items.push(alert);
    dto.security.codeScanning.analyses.items.push({
      id: 7,
      ref: "refs/heads/old",
      commitSha: "a".repeat(40),
      tool: { name: "CodeQL", version: null, guid: null },
      createdAt: "2026-09-01T00:00:00.000Z",
      freshness: "stale",
      outcome: "completed",
      hasWarnings: false,
      resultsCount: 0,
      url: "https://github.com/synthetic-owner/repository/security/code-scanning?query=ref%3Arefs%2Fheads%2Fold",
    });
    expect(observatoryRepositoryEvidenceSchema.parse(dto)).toEqual(dto);
  });
  it.each([
    "actor",
    "owner",
    "grants",
    "capabilities",
    "operations",
    "rawPayload",
    "token",
    "apiKey",
    "secret",
    "secretValue",
  ])("rejects top-level authority or private field %s", (field) => {
    expect(
      observatoryRepositoryEvidenceSchema.safeParse({
        ...evidence(),
        [field]: "unsafe",
      }).success,
    ).toBe(false);
  });
  it.each([
    "secret",
    "secret_value",
    "secretLiteral",
    "locations",
    "snippet",
    "raw",
    "authority",
    "token",
    "html",
  ])("rejects unreviewed derived alert field %s", (field) => {
    const dto = evidence();
    dto.security.secretScanning.items.push({
      ...alert,
      [field]: "DO_NOT_DISCLOSE_LITERAL",
    });
    expect(observatoryRepositoryEvidenceSchema.safeParse(dto).success).toBe(
      false,
    );
  });
  it("rejects incomplete success, fake empty failure, wrong failure state, widened identity and duplicated rows", () => {
    const mutations: ((dto: ObservatoryRepositoryEvidenceDto) => void)[] = [
      (dto) => {
        dto.pullRequests.complete = false;
      },
      (dto) => {
        dto.security.dependabot.state = "unavailable";
      },
      (dto) => {
        dto.security.secretScanning = {
          ...empty(),
          state: "disabled_or_not_found",
          complete: false,
          errorCode: "OPERATIONAL_UNAUTHORIZED",
          retrySeconds: 60,
        };
      },
      (dto) => {
        dto.security.secretScanning = {
          ...empty(),
          state: "unavailable",
          complete: false,
          errorCode: "OPERATIONAL_TIMEOUT",
          retrySeconds: 60,
          items: [alert],
        };
      },
      (dto) => {
        dto.pullRequests.items.push(pull, pull);
      },
      (dto) => {
        dto.security.secretScanning.items.push(alert, alert);
      },
      (dto) => {
        dto.security.secretScanning.items.push({
          ...alert,
          url: "https://attacker.invalid/token",
        });
      },
      (dto) => {
        dto.repository.url = "https://github.com/other/repo";
      },
      (dto) => {
        dto.repository.name = "..";
      },
      (dto) => {
        dto.pullRequests.items.push({
          ...pull,
          url: "https://github.com/other/repo/pull/3",
        });
      },
      (dto) => {
        dto.security.dependabot.items.push(alert);
      },
      (dto) => {
        dto.pullRequests.readAt = "2026-10-18T12:00:00Z";
      },
      (dto) => {
        Object.assign(dto.security.codeScanning, {
          currentHeadCoverage: "complete",
        });
      },
    ];
    for (const mutate of mutations) {
      const dto = evidence();
      mutate(dto);
      expect(observatoryRepositoryEvidenceSchema.safeParse(dto).success).toBe(
        false,
      );
    }
  });
});

it("accepts optional head-bound CI while preserving old PR records as unknown", () => {
  const dto = evidence();
  dto.pullRequests.items.push(pull);
  expect(
    observatoryRepositoryEvidenceSchema.parse(dto).pullRequests.items[0],
  ).not.toHaveProperty("headSha");
  const sha = "b".repeat(40);
  const current = {
    ...dto,
    pullRequests: {
      ...dto.pullRequests,
      items: [
        {
          ...pull,
          headSha: sha,
          requiredCheckCoverage: "unknown",
          checkRuns: { ...empty(), headSha: sha },
          statuses: { ...empty(), headSha: sha },
        },
      ],
    },
  };
  expect(observatoryRepositoryEvidenceSchema.parse(current)).toEqual(current);
});

function currentEvidence(): ObservatoryRepositoryEvidenceDto {
  const dto = evidence(),
    sha = "b".repeat(40),
    base = dto.repository.url;
  dto.pullRequests.items = [
    {
      ...pull,
      headSha: sha,
      requiredCheckCoverage: "unknown",
      checkRuns: {
        ...empty(),
        headSha: sha,
        items: [
          {
            id: 7,
            headSha: sha,
            name: "Literal <script>check</script>",
            status: "completed",
            conclusion: "neutral",
            startedAt: at,
            completedAt: at,
            freshness: "fresh",
            url: base + "/runs/7",
          },
        ],
      },
      statuses: {
        ...empty(),
        headSha: sha,
        items: [
          {
            id: 8,
            context: "legacy context",
            state: "pending",
            createdAt: at,
            updatedAt: at,
            freshness: "fresh",
            url: base + "/commit/" + sha,
          },
        ],
      },
    },
  ];
  return dto;
}
describe("strict current-head CI contract", () => {
  it("retains literal names, exact official links, independent states and explicit unknown required coverage", () => {
    const dto = currentEvidence();
    expect(observatoryRepositoryEvidenceSchema.parse(dto)).toEqual(dto);
    const pr = dto.pullRequests.items[0]!;
    pr.statuses = {
      ...pr.statuses!,
      state: "inaccessible",
      complete: false,
      items: [],
      errorCode: "OPERATIONAL_UNAUTHORIZED",
      retrySeconds: 60,
    };
    expect(
      observatoryRepositoryEvidenceSchema.parse(dto).pullRequests.items[0]
        ?.checkRuns?.complete,
    ).toBe(true);
  });
  it.each([
    "wrong-source-head",
    "missing-head",
    "invalid-head",
    "unknown-head-success",
    "wrong-row-head",
    "duplicate-check",
    "duplicate-status",
    "wrong-run-link",
    "wrong-status-link",
    "query-run-link",
    "future-source-read",
    "fake-required-pass",
    "pending-conclusion",
    "pending-completed-time",
    "reversed-check-time",
    "unknown-freshness-with-time",
    "known-freshness-without-time",
    "reversed-status-time",
    "failed-source-with-rows",
    "complete-denial",
    "private-check-field",
    "private-status-field",
    "private-source-field",
  ])(
    "rejects %s instead of widening or inventing current-head evidence",
    (mode) => {
      const dto = currentEvidence(),
        pr = dto.pullRequests.items[0]!,
        checks = pr.checkRuns!,
        statuses = pr.statuses!,
        run = checks.items[0]!,
        status = statuses.items[0]!;
      if (mode === "wrong-source-head") checks.headSha = "c".repeat(40);
      if (mode === "missing-head") delete pr.headSha;
      if (mode === "invalid-head") pr.headSha = "not-a-sha";
      if (mode === "unknown-head-success") {
        pr.headSha = null;
        checks.headSha = null;
        statuses.headSha = null;
        checks.items = [];
        statuses.items = [];
      }
      if (mode === "wrong-row-head") run.headSha = "c".repeat(40);
      if (mode === "duplicate-check") checks.items.push({ ...run });
      if (mode === "duplicate-status") statuses.items.push({ ...status });
      if (mode === "wrong-run-link")
        run.url = "https://github.com/another/repository/runs/7";
      if (mode === "wrong-status-link")
        status.url = dto.repository.url + "/commit/" + "c".repeat(40);
      if (mode === "query-run-link") run.url += "?token=private";
      if (mode === "future-source-read") checks.readAt = "2026-10-18T12:00:00Z";
      if (mode === "fake-required-pass")
        Object.assign(pr, { requiredCheckCoverage: "complete" });
      if (mode === "pending-conclusion") run.status = "queued";
      if (mode === "pending-completed-time") {
        run.status = "in_progress";
        run.conclusion = null;
      }
      if (mode === "reversed-check-time")
        run.completedAt = "2026-10-16T12:00:00Z";
      if (mode === "unknown-freshness-with-time") run.freshness = "unknown";
      if (mode === "known-freshness-without-time") {
        run.startedAt = null;
        run.completedAt = null;
      }
      if (mode === "reversed-status-time")
        status.updatedAt = "2026-10-16T12:00:00Z";
      if (mode === "failed-source-with-rows") {
        checks.state = "unavailable";
        checks.complete = false;
        checks.errorCode = "OPERATIONAL_INVALID_RESPONSE";
        checks.retrySeconds = 60;
      }
      if (mode === "complete-denial") {
        statuses.errorCode = "OPERATIONAL_UNAUTHORIZED";
        statuses.retrySeconds = 60;
      }
      if (mode === "private-check-field")
        Object.assign(run, { output: { summary: "PRIVATE_MARKER" } });
      if (mode === "private-status-field")
        Object.assign(status, { target_url: "https://attacker.invalid" });
      if (mode === "private-source-field")
        Object.assign(checks, { rawPayload: [] });
      expect(observatoryRepositoryEvidenceSchema.safeParse(dto).success).toBe(
        false,
      );
    },
  );
  it("accepts an unknown newly read head only with unavailable CI while old absent fields stay absent", () => {
    const dto = currentEvidence(),
      pr = dto.pullRequests.items[0]!;
    pr.headSha = null;
    const unavailable = {
      ...empty(),
      headSha: null,
      state: "unsupported" as const,
      complete: false,
      errorCode: "OPERATIONAL_UNSUPPORTED_SOURCE" as const,
      retrySeconds: 60,
    };
    pr.checkRuns = unavailable;
    pr.statuses = unavailable;
    expect(observatoryRepositoryEvidenceSchema.parse(dto)).toEqual(dto);
    dto.pullRequests.items = [pull];
    expect(
      observatoryRepositoryEvidenceSchema.parse(dto).pullRequests.items[0],
    ).toEqual(pull);
  });
});
