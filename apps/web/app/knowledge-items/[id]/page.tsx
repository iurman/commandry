import KnowledgeItemWorkspace from "./KnowledgeItemWorkspace";

export default async function KnowledgeItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KnowledgeItemWorkspace knowledgeItemId={id} />;
}
