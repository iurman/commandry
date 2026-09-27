export type WorkType = "task" | "initiative" | "subtask";

export function WorkTypeBadge({
  type,
  status,
}: {
  type: WorkType;
  status?: "open" | "done";
}) {
  const label =
    type === "initiative"
      ? "Initiative"
      : type === "subtask"
        ? "Subtask"
        : "Task";
  return (
    <span className="cmd-record-kind">
      Local {label}
      {status ? ` / ${status}` : ""}
    </span>
  );
}
