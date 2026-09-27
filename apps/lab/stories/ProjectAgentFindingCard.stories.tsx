import type { Meta, StoryObj } from "@storybook/react";
import { ProjectAgentFindingCard } from "@commandry/ui";

const meta = {
  title: "Agents/Saved project finding",
  component: ProjectAgentFindingCard,
} satisfies Meta<typeof ProjectAgentFindingCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SyntheticUnverified: Story = {
  args: {
    finding: {
      runId: "3a11e8b9-97df-4831-924e-12d1e786775d",
      agentName: "Harbor reader",
      workTitle: "Review the workshop monitor",
      packetId: "96aa7133-d53d-41e4-af33-9fecc2b91721",
      packetDigest: "a".repeat(64),
      completedAt: "2026-09-27T10:00:00.000Z",
      summary:
        "A local fake run read the selected brief and work item. Its conclusion is unverified.",
      evidenceCount: 4,
      evidence: [
        {
          id: "0ef5d360-5d30-4863-a148-b4e4ba020101",
          kind: "work_item",
          href: "/api/v1/work-items/0ef5d360-5d30-4863-a148-b4e4ba020101",
          sourceLabel: "Original local task",
          isSynthetic: false,
        },
        {
          id: "cab264fd-a273-4b24-972f-cd112134a44d",
          kind: "event",
          href: "/api/v1/events/cab264fd-a273-4b24-972f-cd112134a44d",
          sourceLabel: "Synthetic operational fixture",
          isSynthetic: true,
        },
      ],
      sourceHref: "/api/v1/agent-runs/3a11e8b9-97df-4831-924e-12d1e786775d",
      packetHref:
        "/api/v1/execution-packets/96aa7133-d53d-41e4-af33-9fecc2b91721",
    },
  },
};
