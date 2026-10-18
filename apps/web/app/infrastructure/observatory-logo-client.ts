import {
  observatoryCatalogueQuerySchema,
  type ObservatorySceneQuery,
} from "@commandry/contracts";
import type {
  ObservatoryLogoReviewClient,
  ObservatoryLogoUrl,
} from "@commandry/ui";

/** Rejects with the server's safe failure code so the owner sees why. */
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
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || response.redirected) {
    const code =
      body && typeof body === "object" && "code" in body
        ? (body as { code: unknown }).code
        : null;
    throw Object.assign(new Error("Logo review unavailable"), {
      code: typeof code === "string" ? code : null,
    });
  }
  return body;
}
export function createObservatoryLogoClient(
  query: Pick<ObservatorySceneQuery, "schemaVersion" | "projectId">,
): ObservatoryLogoReviewClient {
  return {
    loadLogo: (resourceId) =>
      post(
        "/api/v1/infrastructure/observatory/catalogue",
        observatoryCatalogueQuerySchema.parse({
          ...query,
          kind: "logo",
          resourceId,
        }),
      ),
    preview: (input) =>
      post("/api/v1/infrastructure/observatory/logo-preview", input),
    review: (input) =>
      post("/api/v1/infrastructure/observatory/reviews/logo", input),
  };
}
/** Same-origin, digest-addressed badge image within the selected project. */
export function observatoryLogoUrl(projectId?: string): ObservatoryLogoUrl {
  return (resourceId, digest) =>
    `/api/v1/infrastructure/observatory/logos/${encodeURIComponent(resourceId)}/${encodeURIComponent(digest)}` +
    (projectId ? `?projectId=${encodeURIComponent(projectId)}` : "");
}
