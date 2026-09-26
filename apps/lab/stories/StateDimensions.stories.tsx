import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "@commandry/ui";

function StateDimensions() {
  return (
    <div className="lab-stack">
      <p>
        These dimensions remain separate. Text carries the state without color.
      </p>
      <div className="lab-row">
        <StatusBadge dimension="lifecycle" label="Active" tone="neutral" />
        <StatusBadge dimension="health" label="Degraded" tone="caution" />
        <StatusBadge
          dimension="attention"
          label="Action required"
          tone="critical"
        />
        <StatusBadge dimension="sync" label="Stale" tone="caution" />
        <StatusBadge
          dimension="execution"
          label="Waiting approval"
          tone="neutral"
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Foundations/State dimensions",
  component: StateDimensions,
} satisfies Meta<typeof StateDimensions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RepresentativeStates: Story = {};
