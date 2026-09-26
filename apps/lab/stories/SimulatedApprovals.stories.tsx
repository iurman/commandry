import type { Meta, StoryObj } from "@storybook/react";
import {
  SimulatedApprovalAuditList,
  SimulatedApprovalCard,
  SimulatedApprovalPanel,
  StatePanel,
  type SimulatedApprovalAuditView,
  type SimulatedApprovalView,
} from "@commandry/ui";

const at = "2026-09-25T10:00:00.000Z";
const pending: SimulatedApprovalView = {
  id: "b5ad2eb9-038b-467f-ac2f-efb11d62391d",
  occurrenceId: "817b0a61-972a-4c24-bc0b-7694e8203c38",
  requestFingerprint: "a".repeat(64),
  descriptorDigest: "b".repeat(64),
  descriptor: {
    schemaVersion: "simulated-resource-restart/v1",
    actionType: "simulated.resource.restart",
    intendedActor: {
      agentId: "8f24f301-47fa-4ca8-8492-4264993c5025",
      runId: "3a11e8b9-97df-4831-924e-12d1e786775d",
    },
    proposedBy: "local-reviewer:unattributed",
    packet: {
      id: "96aa7133-d53d-41e4-af33-9fecc2b91721",
      version: 2,
      digest: "c".repeat(64),
    },
    target: {
      projectId: "0ef5d360-5d30-4863-a148-b4e4ba020101",
      resourceId: "92fa3fe6-c2db-43a8-9e10-647662e77ae5",
      projectResourceLinkId: "d3e9650f-0877-4e13-b7a7-7d4b96f1aff6",
    },
    parameters: { mode: "graceful" },
    reason:
      "Demonstrate approval review for a synthetic local resource restart.",
    expectedResult:
      "Record a no-effect local simulation; resource state does not change.",
    risk: "sensitive",
    requiredCapability: "infrastructure.restart",
    policy: {
      automaticCeiling: "reversible",
      approvalRequired: true,
      grantScope: "simulation_only",
    },
    reversibility: {
      isApplicable: false,
      explanation: "No real change is made; rollback is not applicable.",
    },
    expiresAt: "2026-09-25T11:00:00.000Z",
    sourceLabel: "Synthetic local action proposal",
    isSynthetic: true,
    externalActions: [],
  },
  state: "pending",
  decision: null,
  outcome: null,
  createdAt: at,
  updatedAt: at,
};

const history: SimulatedApprovalAuditView[] = [
  {
    id: "6fe8091e-a4dd-4dab-bd31-5c7bc1862ed4",
    approvalId: pending.id,
    eventType: "proposed",
    actor: "local-reviewer:unattributed",
    occurrenceId: pending.occurrenceId,
    detail:
      "Exact simulated.resource.restart descriptor recorded for local review.",
    createdAt: at,
  },
];

const meta = {
  title: "Actions/Simulated approvals",
  component: SimulatedApprovalPanel,
  parameters: {
    docs: {
      description: {
        component:
          "The production approval panel displays the immutable simulated descriptor, risk and capability threshold, exact target, digest, lineage, and no-effect outcome. These stories use fixed synthetic records only.",
      },
    },
  },
} satisfies Meta<typeof SimulatedApprovalPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: {
    approval: pending,
    projectName: "Harbor operations",
    resourceName: "Local test service",
  },
};

export const ApprovedSimulationRecorded: Story = {
  args: {
    approval: {
      ...pending,
      state: "approved",
      decision: {
        kind: "approve",
        actor: "local-reviewer:unattributed",
        occurrenceId: "cdb88224-97a5-4749-99f8-c1e531a5d924",
        decidedAt: "2026-09-25T10:03:00.000Z",
      },
      outcome: {
        kind: "simulated_only",
        verificationStatus: "unverified",
        externalActions: [],
        resourceStateChanged: false,
        recordedAt: "2026-09-25T10:03:02.000Z",
        summary:
          "Synthetic local restart simulation recorded. No external action occurred and resource state did not change.",
      },
    },
    projectName: "Harbor operations",
    resourceName: "Local test service",
  },
};

export const Rejected: Story = {
  args: {
    approval: {
      ...pending,
      state: "rejected",
      decision: {
        kind: "reject",
        actor: "local-reviewer:unattributed",
        occurrenceId: "bb27b675-99a1-4299-bcf2-01a49fa3c63b",
        decidedAt: "2026-09-25T10:04:00.000Z",
      },
    },
  },
};

export const Expired: Story = {
  args: {
    approval: {
      ...pending,
      state: "expired",
      updatedAt: "2026-09-25T11:00:00.000Z",
    },
  },
};

export const QueueCard: Story = {
  args: { approval: pending },
  render: () => <SimulatedApprovalCard approval={pending} />,
};

export const AuditHistory: Story = {
  args: { approval: pending },
  render: () => <SimulatedApprovalAuditList items={history} />,
};

export const Loading: Story = {
  args: { approval: pending },
  render: () => (
    <StatePanel
      id="approval-loading"
      title="Exact action review"
      state="loading"
      description="Loading the immutable local proposal and audit history."
    />
  ),
};

export const Empty: Story = {
  args: { approval: pending },
  render: () => (
    <StatePanel
      id="approval-empty"
      title="Approval requests"
      state="empty"
      description="No synthetic action proposals have been recorded in this view."
    />
  ),
};

export const ErrorState: Story = {
  args: { approval: pending },
  render: () => (
    <StatePanel
      id="approval-error"
      title="Exact action review"
      state="error"
      description="The approval record could not be loaded. The local decision state is unknown."
    />
  ),
};
