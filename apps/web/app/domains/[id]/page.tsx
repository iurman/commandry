import DomainDetail from "./DomainDetail";

export default async function DomainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DomainDetail domainId={id} />;
}
