import ResourceDetail from "./ResourceDetail";

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResourceDetail resourceId={id} />;
}
