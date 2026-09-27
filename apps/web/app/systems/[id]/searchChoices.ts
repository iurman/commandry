import type { SearchResult } from "@commandry/contracts";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export async function searchNamedChoices(
  kind: "project" | "resource",
  query: string,
  cursor?: string | null,
): Promise<PageResponse<{ id: string; name: string }>> {
  const page = await apiJson<PageResponse<SearchResult>>(
    `${pagePath("/api/v1/search", cursor)}&q=${encodeURIComponent(query)}`,
  );
  return {
    items: page.items
      .filter((item) => item.kind === kind)
      .map((item) => ({ id: item.id, name: item.title })),
    nextCursor: page.nextCursor,
  };
}
