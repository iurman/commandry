import LocalMcpSessionWorkspace from "./LocalMcpSessionWorkspace";

export default async function LocalMcpSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LocalMcpSessionWorkspace sessionId={id} />;
}
