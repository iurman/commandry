import type { Meta, StoryObj } from "@storybook/react";
import { Button, LocalIntegrationCard } from "@commandry/ui";

const meta = {
  title: "Records/LocalIntegrationCard",
  component: LocalIntegrationCard,
  parameters: { layout: "centered" },
  args: {
    name: "Synthetic uptime source",
    kind: "synthetic-operations",
    enabled: true,
    projectName: "Synthetic Storybook project fixture",
    projectHref: "#project",
    resourceName: "Synthetic service",
    resourceHref: "#resource",
    activityHref: "#activity",
    lastAttemptAt: "2026-09-26T10:00:00.000Z",
    lastSuccessAt: "2026-09-26T10:00:01.000Z",
    lastError: null,
    freshnessState: "stale",
    freshnessWindowMinutes: 60,
    lastObservedAt: "2026-09-26T10:00:00.000Z",
    lastReceivedAt: "2026-09-26T10:00:01.000Z",
    observationEvidenceHref: "#synthetic-envelope",
    children: <Button>Simulate monitor down</Button>,
  },
} satisfies Meta<typeof LocalIntegrationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enabled: Story = {};
export const Disabled: Story = {
  args: {
    name: "Synthetic repository source",
    kind: "synthetic-development",
    enabled: false,
    resourceName: null,
    resourceHref: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    freshnessState: "unknown",
    lastObservedAt: null,
    lastReceivedAt: null,
    observationEvidenceHref: null,
    children: <Button disabled>Simulate PR merge</Button>,
  },
};
export const Failed: Story = {
  args: {
    lastSuccessAt: null,
    lastError:
      "Fixture projection failed. Original evidence was kept for retry.",
  },
};
