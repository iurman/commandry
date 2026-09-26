import ApprovalWorkspace from "./ApprovalWorkspace";

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApprovalWorkspace approvalId={id} />;
}
