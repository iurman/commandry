import OvernightEntryWorkspace from "./OvernightEntryWorkspace";

export default async function OvernightEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OvernightEntryWorkspace entryId={id} />;
}
