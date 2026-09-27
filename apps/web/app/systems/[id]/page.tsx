import SystemDetail from "./SystemDetail";

export default async function SystemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SystemDetail systemId={id} />;
}
