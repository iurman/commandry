export type WorkStatusFilter = "open" | "done" | "all";
export type WorkFocus = {
  priority: "all" | "low" | "normal" | "high" | "unset";
  assignee: "all" | "unassigned" | "local_user" | "agent";
  due: "all" | "overdue" | "today" | "upcoming" | "undated";
};

export const initialWorkFocus: WorkFocus = {
  priority: "all",
  assignee: "all",
  due: "all",
};

export function workPagePath(input: {
  status: WorkStatusFilter;
  projectId: string | null;
  focus: WorkFocus;
  asOf: string;
  cursor?: string | null | undefined;
}) {
  const params = new URLSearchParams({ limit: "20" });
  if (input.status !== "all") params.set("status", input.status);
  if (input.projectId) params.set("projectId", input.projectId);
  if (input.focus.priority !== "all")
    params.set("priority", input.focus.priority);
  if (input.focus.assignee !== "all")
    params.set("assignee", input.focus.assignee);
  if (input.focus.due !== "all") {
    params.set("due", input.focus.due);
    params.set("asOf", input.asOf);
  }
  if (input.cursor) params.set("cursor", input.cursor);
  return `/api/v1/work-items?${params}`;
}
