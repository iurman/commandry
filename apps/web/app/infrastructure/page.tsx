import InfrastructureOverviewScreen from "./InfrastructureOverviewScreen";

export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; q?: string }>;
}) {
  const scope = await searchParams;
  return (
    <InfrastructureOverviewScreen
      initialProjectId={
        typeof scope.projectId === "string" ? scope.projectId : ""
      }
      initialQuery={typeof scope.q === "string" ? scope.q : ""}
    />
  );
}
