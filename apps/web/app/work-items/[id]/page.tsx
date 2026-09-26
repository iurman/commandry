import WorkItemWorkspace from "./WorkItemWorkspace";

export default async function WorkItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkItemWorkspace workItemId={id} />;
}
