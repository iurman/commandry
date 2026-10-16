"use client";
import { FoundationCaptureProposalPanel } from "./FoundationCaptureProposalPanel";
export function FoundationTaskProposalPanel(props: {
  captureId: string;
  projectId: string;
  onReviewed: () => void;
  active?: boolean;
}) {
  return <FoundationCaptureProposalPanel {...props} kind="task" />;
}
