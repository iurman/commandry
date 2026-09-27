export type KnowledgeKind =
  | "note"
  | "idea"
  | "research"
  | "requirement"
  | "architecture_note"
  | "runbook"
  | "meeting_note"
  | "lesson_learned"
  | "instruction"
  | "link"
  | "document";

export function knowledgeTypeLabel(kind: KnowledgeKind): string {
  return {
    note: "Note",
    idea: "Idea",
    research: "Research",
    requirement: "Requirement",
    architecture_note: "Architecture note",
    runbook: "Runbook",
    meeting_note: "Meeting note",
    lesson_learned: "Lesson learned",
    instruction: "Instruction",
    link: "Link",
    document: "Document",
  }[kind];
}

export function KnowledgeTypeBadge({ kind }: { kind: KnowledgeKind }) {
  return (
    <span className="cmd-record-kind">Local {knowledgeTypeLabel(kind)}</span>
  );
}
