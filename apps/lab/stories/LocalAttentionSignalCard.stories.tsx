import type { Meta, StoryObj } from "@storybook/react";
import { LocalAttentionSignalCard } from "@commandry/ui";

const at = "2026-09-27T10:00:00.000Z";
const signal = {
  id: "1d3e893c-27db-42cc-a3f9-d66711d4b8b7",
  ruleId: "metric_drop" as const,
  state: "active" as const,
  projectName: "Harbor lab fixture",
  integrationName: null,
  resourceName: "Synthetic monitor",
  evidenceHref: "/api/v1/metrics/384987ed-f78f-4816-ac93-761c0fd056b6",
  previousEvidenceHref: "/api/v1/metrics/299c9bf6-70e9-4753-b996-7715e61612ef",
  reason:
    "Synthetic availability fell from 100% to 0%, meeting the 25-point drop rule. This does not establish real resource health.",
  observedAt: at,
  previousObservedAt: "2026-09-27T09:55:00.000Z",
  changedAt: at,
  evaluatedAt: at,
};

const meta = {
  title: "Patterns/Local attention signal",
  component: LocalAttentionSignalCard,
  args: { signal },
} satisfies Meta<typeof LocalAttentionSignalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveDrop: Story = {};
export const ResolvedDrop: Story = {
  args: { signal: { ...signal, state: "resolved" } },
};
export const StaleSource: Story = {
  args: {
    signal: {
      ...signal,
      ruleId: "source_stale",
      integrationName: "Synthetic operations feed",
      resourceName: null,
      evidenceHref:
        "/api/v1/source-envelopes/384987ed-f78f-4816-ac93-761c0fd056b6",
      previousEvidenceHref: null,
      previousObservedAt: null,
      reason:
        "The last synthetic observation is older than its configured freshness window. This does not establish real source health.",
    },
  },
};
