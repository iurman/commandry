import type { Meta, StoryObj } from "@storybook/react";
import { ProjectFlowCard } from "@commandry/ui";

const at = "2026-09-27T10:00:00.000Z";
const meta = {
  title: "Flow/Project record",
  component: ProjectFlowCard,
} satisfies Meta<typeof ProjectFlowCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SyntheticAgentRun: Story = {
  args: {
    item: {
      id: "3a11e8b9-97df-4831-924e-12d1e786775d",
      kind: "local_agent_run",
      occurredAt: at,
      recordedAt: at,
      title: "Harbor reader",
      state: "succeeded",
      detail: "unverified",
      sourceHref: "/api/v1/agent-runs/3a11e8b9-97df-4831-924e-12d1e786775d",
      sourceLabel: "Synthetic local fake agent run",
      isSynthetic: true,
      related: [
        {
          kind: "agent",
          id: "8f24f301-47fa-4ca8-8492-4264993c5025",
          name: "Harbor reader",
          href: "/api/v1/agents/8f24f301-47fa-4ca8-8492-4264993c5025",
        },
      ],
    },
  },
};

export const ManualSystemLink: Story = {
  args: {
    item: {
      id: "5b311f36-f474-4297-9e5a-aa396fe6d257",
      kind: "system_link",
      occurredAt: at,
      recordedAt: at,
      title: "Workshop network",
      state: "active",
      detail: "relates_to",
      sourceHref:
        "/api/v1/system-project-links/5b311f36-f474-4297-9e5a-aa396fe6d257",
      sourceLabel: "Manual system relationship",
      isSynthetic: false,
      related: [
        {
          kind: "system",
          id: "d0b6976a-a7d2-4664-9612-d4da46b7a6b5",
          name: "Workshop network",
          href: "/api/v1/systems/d0b6976a-a7d2-4664-9612-d4da46b7a6b5",
        },
      ],
    },
  },
};
