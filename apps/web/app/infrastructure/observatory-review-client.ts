import {
  observatoryCatalogueKindSchema,
  observatoryCatalogueQuerySchema,
  observatoryCatalogueResultSchema,
  type ObservatorySceneQuery,
} from "@commandry/contracts";
import type { ObservatoryReviewClient } from "@commandry/ui";

async function post(path: string, input: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok || response.redirected)
    throw new Error("Reviewed configuration unavailable");
  return response.json();
}
export function createObservatoryReviewClient(
  query: ObservatorySceneQuery,
): ObservatoryReviewClient {
  return {
    async loadCatalogue(kind, resourceId) {
      const input = observatoryCatalogueQuerySchema.parse({
        ...query,
        kind,
        resourceId,
      });
      const result = observatoryCatalogueResultSchema.parse(
        await post("/api/v1/infrastructure/observatory/catalogue", input),
      );
      if (result.kind !== input.kind)
        throw new Error("Reviewed configuration unavailable");
      return result;
    },
    async review(kind, input) {
      const operation = observatoryCatalogueKindSchema.parse(kind);
      return post(
        "/api/v1/infrastructure/observatory/reviews/" + operation,
        input,
      );
    },
  };
}
