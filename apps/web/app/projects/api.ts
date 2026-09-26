export interface ProjectRecord {
  id: string;
  name: string;
  summary: string | null;
  type: string;
  lifecycle: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceRecord {
  id: string;
  kind: string;
  name: string;
  subtype: string | null;
  parentResourceId: string | null;
  state: string | null;
  externalUrl: string | null;
  lastObservedAt: string | null;
}

export interface ProjectResourceLink {
  id: string;
  type: string;
  inverseType: string;
  resource: ResourceRecord;
}

export interface PageResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function pagePath(path: string, cursor?: string | null) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return `${path}?${params}`;
}
