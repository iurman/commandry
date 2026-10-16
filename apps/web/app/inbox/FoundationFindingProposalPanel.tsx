"use client";
import { FoundationCaptureProposalPanel } from "./FoundationCaptureProposalPanel";
export function FoundationFindingProposalPanel(props: {
  captureId: string;
  projectId: string;
  onReviewed: () => void;
  active?: boolean;
}) {
  return <FoundationCaptureProposalPanel {...props} kind="finding" />;
}
