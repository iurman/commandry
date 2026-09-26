import AutomationDetail from "./AutomationDetail";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AutomationDetail automationId={id} />;
}
