import { expect, it } from "vitest";
import { observatorySourceBindingChangeSchema } from "./observatory-management";

const binding = {
  id: "00000000-0000-4000-8000-000000000001",
  expectedVersion: 0,
  resourceId: "00000000-0000-4000-8000-000000000002",
  projectId: "00000000-0000-4000-8000-000000000003",
  environment: "production",
  kind: "http-readiness",
  externalId: "commandry-web-readiness",
  enabled: false,
  freshnessSeconds: 300,
  review: {
    evidenceRefs: ["owner-reviewed-web-service"],
    note: "Web readiness",
  },
};
it("permits an explicit reviewed fixed readiness identity", () => {
  expect(observatorySourceBindingChangeSchema.parse(binding)).toEqual(binding);
});
it.each([
  "https://other.example/health/ready",
  "http://127.0.0.1/private",
  "another-service",
  "commandry-web-readiness?token=private",
])("rejects arbitrary readiness target %s", (externalId) => {
  expect(
    observatorySourceBindingChangeSchema.safeParse({ ...binding, externalId })
      .success,
  ).toBe(false);
});
