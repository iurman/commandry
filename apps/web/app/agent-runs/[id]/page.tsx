import AgentRunWorkspace from "./AgentRunWorkspace";

export default async function AgentRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgentRunWorkspace runId={id} />;
}
