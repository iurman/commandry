import ExecutionPacketWorkspace from "./ExecutionPacketWorkspace";

export default async function ExecutionPacketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExecutionPacketWorkspace packetId={id} />;
}
