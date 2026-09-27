export type WorkAssigneeKind = "unassigned" | "local_user" | "agent";

export function WorkAssigneeBadge({
  kind,
  label,
}: {
  kind: WorkAssigneeKind;
  label?: string | null;
}) {
  const text =
    kind === "unassigned"
      ? "Unassigned"
      : kind === "local_user"
        ? "Local user (unattributed)"
        : (label ?? "Synthetic local agent");
  return <span className="cmd-record-kind">Assigned: {text}</span>;
}
