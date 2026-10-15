import { expect, test } from "vitest";
import {
  infrastructureOverviewQuerySchema,
  infrastructureResourceSchema,
} from "./infrastructure-overview";

test("overview scopes have bounded pages and reject invalid identifiers and oversized search", () => {
  expect(infrastructureOverviewQuerySchema.parse({})).toEqual({
    limit: 12,
    q: "",
  });
  for (const query of [
    { limit: 51 },
    { limit: 0 },
    { cursor: "bad" },
    { projectId: "bad" },
    { q: "x".repeat(161) },
  ])
    expect(infrastructureOverviewQuerySchema.safeParse(query).success).toBe(
      false,
    );
  expect(infrastructureOverviewQuerySchema.parse({ q: "  host  " }).q).toBe(
    "host",
  );
});
test("infrastructure summary cannot imply service health from telemetry", () => {
  const item = {
    id: crypto.randomUUID(),
    name: "Host",
    kind: "host",
    parentResourceId: null,
    projects: [],
    sources: [],
    telemetry: "reporting",
    health: "unknown",
    metrics: [],
  };
  expect(infrastructureResourceSchema.safeParse(item).success).toBe(true);
  expect(
    infrastructureResourceSchema.safeParse({ ...item, health: "healthy" })
      .success,
  ).toBe(false);
});
