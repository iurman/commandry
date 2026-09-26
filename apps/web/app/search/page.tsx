import SearchClient from "./SearchClient";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    projectId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;
  const projectId = Array.isArray(params.projectId)
    ? params.projectId[0]
    : params.projectId;
  return (
    <SearchClient
      initialQuery={query ?? ""}
      initialProjectId={projectId ?? ""}
    />
  );
}
