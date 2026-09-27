import type { Meta, StoryObj } from "@storybook/react";
import { CachedLocalResultCard, LocalAgentRouteCard } from "@commandry/ui";

const at = "2026-09-27T09:30:00.000Z";
const agentId = "8f24f301-47fa-4ca8-8492-4264993c5025";
const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";

const meta = {
  title: "Agents/Local routing and saved output",
  component: LocalAgentRouteCard,
} satisfies Meta<typeof LocalAgentRouteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AssignedCandidate: Story = {
  args: {
    candidate: {
      agent: {
        id: agentId,
        name: "Harbor reader",
        role: "Review saved project context",
        runtime: "local-fake-v1",
      },
      activeRunCount: 1,
      reason: "Assigned to this packet's project for scoped reads",
      readOperations: ["project.brief.read", "work.read"],
    },
  },
};

export const SavedOutput = () => (
  <CachedLocalResultCard
    result={{
      runId: "3a11e8b9-97df-4831-924e-12d1e786775d",
      completedAt: at,
      summary:
        "Synthetic local fake run inspected the project brief and selected work item. No task was executed or verified.",
      sourceLabel: "Saved synthetic local fake-run result",
      verificationStatus: "unverified",
    }}
    evidence={[
      {
        kind: "project_brief",
        id: projectId,
        href: `/api/v1/projects/${projectId}/brief`,
        sourceLabel: "Synthetic lab fixture",
        recordedAt: at,
        isSynthetic: true,
      },
    ]}
  />
);
