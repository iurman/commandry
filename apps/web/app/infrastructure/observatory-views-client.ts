import {
  observatoryViewSchema,
  observatoryViewPageSchema,
  observatoryViewDeletedSchema,
} from "@commandry/contracts";
import type { ObservatoryViewsClient } from "@commandry/ui";
async function post(operation: string, input: unknown) {
  const response = await fetch(
    "/api/v1/infrastructure/observatory/views/" + operation,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Account view operation unavailable");
  return response.json();
}
export const observatoryViewsClient: ObservatoryViewsClient = {
  page: async (input) =>
    observatoryViewPageSchema.parse(await post("page", input)),
  create: async (input) =>
    observatoryViewSchema.parse(await post("create", input)),
  update: async (input) =>
    observatoryViewSchema.parse(await post("update", input)),
  delete: async (input) =>
    observatoryViewDeletedSchema.parse(await post("delete", input)),
};
