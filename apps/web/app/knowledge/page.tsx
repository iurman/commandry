import KnowledgeWorkspace from "./KnowledgeWorkspace";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[] }>;
}) {
  const params = await searchParams;
  const projectId = Array.isArray(params.projectId)
    ? params.projectId[0]
    : params.projectId;
  return <KnowledgeWorkspace projectId={projectId ?? null} />;
}
