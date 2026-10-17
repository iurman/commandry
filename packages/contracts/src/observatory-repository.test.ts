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
