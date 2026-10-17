import {
  foundationProjectWorkCursorSchema,
  foundationProjectWorkPageSchema,
  foundationProjectWorkQuerySchema,
} from "@commandry/contracts";
import type { ObservatoryWorkDockProps } from "@commandry/ui";
import type { PageResponse, ProjectRecord } from "../projects/api";

/** Exhaust the existing canonical owner catalogue before publishing Work scope. */
export async function loadCompleteObservatoryWorkProjects(
  loadPage: (cursor: string | null) => Promise<PageResponse<ProjectRecord>>,
): Promise<ProjectRecord[]> {
  const items: ProjectRecord[] = [],
    identities = new Set<string>(),
    cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await loadPage(cursor);
    if (
      !page ||
      !Array.isArray(page.items) ||
      page.items.length > 100 ||
      (page.nextCursor !== null &&
        (typeof page.nextCursor !== "string" ||
          !page.nextCursor.length ||
          !page.items.length))
    )
      throw new Error("Canonical project catalogue unavailable");
    for (const project of page.items) {
      const id = foundationProjectWorkCursorSchema.shape.projectId.parse(
        project.id,
      );
      if (identities.has(id) || typeof project.name !== "string")
        throw new Error("Canonical project catalogue unavailable");
      identities.add(id);
      items.push(project);
    }
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (cursors.has(cursor))
        throw new Error("Canonical project catalogue unavailable");
      cursors.add(cursor);
    }
  } while (cursor !== null);
  return items;
}

/** Stable owner-session loader; project/cursor values never supply authority or a URL. */
export const loadObservatoryWorkPage: ObservatoryWorkDockProps["loadPage"] =
  async (projectId, cursor) => {
    try {
      const input = foundationProjectWorkQuerySchema.parse({
        projectId,
        limit: 100,
        cursor: foundationProjectWorkCursorSchema.nullable().parse(cursor),
      });
      const response = await fetch(
        "/api/v1/infrastructure/observatory/work/page",
        {
          method: "POST",
          mode: "same-origin",
          credentials: "same-origin",
          redirect: "error",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!response.ok || response.redirected) throw new Error();
      const page = foundationProjectWorkPageSchema.parse(await response.json());
      if (page.requestedProjectId !== input.projectId) throw new Error();
      return page;
    } catch {
      throw new Error("Canonical Work unavailable");
    }
  };
