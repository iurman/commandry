import type { Meta, StoryObj } from "@storybook/react";
import {
  SyntheticAlertCard,
  SyntheticAttentionCard,
  SyntheticEventCard,
} from "@commandry/ui";

function SyntheticSignals({
  mode,
}: {
  mode: "event" | "active-attention" | "resolved-attention" | "attention";
}) {
  return (
    <div className="lab-stack">
      <p>
        Synthetic lab fixture. These examples are not live observations or
        operational health.
      </p>
      {mode === "event" ? (
        <SyntheticEventCard
          evidenceHref="/api/v1/source-envelopes/50c5f184-c2fb-4506-8293-7a11fa806d54"
          id="61eb483c-af3a-4b34-8cbe-9fe47c9182a9"
          ingestedAt="2026-09-25T10:02:00.000Z"
          occurredAt="2026-09-25T10:00:00.000Z"
          projectName="Harbor notes"
          resourceName="Synthetic monitor target"
          severity="critical"
          sourceLabel="Synthetic operational fixture"
          summary="Synthetic monitor reported unavailable"
          type="operations.monitor-down"
        />
      ) : mode === "attention" ? (
        <SyntheticAttentionCard
          evidenceHref="/api/v1/source-envelopes/50c5f184-c2fb-4506-8293-7a11fa806d54"
          id="fd85b30c-e76d-4ad0-ad35-a702e7bd8939"
          lastObservedAt="2026-09-25T10:02:00.000Z"
          priority="critical"
          projectName="Harbor notes"
          reason="A linked synthetic monitor reported unavailable. Review the source event before acting."
          resourceName="Synthetic monitor target"
          ruleId="synthetic.monitor-unavailable"
          sourceLabel="Synthetic operational fixture"
          title="Review simulated availability"
        />
      ) : (
        <SyntheticAlertCard
          evidenceEventIds={[
            "61eb483c-af3a-4b34-8cbe-9fe47c9182a9",
            ...(mode === "resolved-attention"
              ? ["98cbce0b-e905-4c2a-9870-38f2b384a804"]
              : []),
          ]}
          evidenceHref="/api/v1/events/61eb483c-af3a-4b34-8cbe-9fe47c9182a9"
          firstObservedAt="2026-09-25T10:00:00.000Z"
          id="bc13e8cd-d5d7-4476-a77a-7984a6c608b3"
          lastObservedAt="2026-09-25T10:02:00.000Z"
          projectName="Harbor notes"
          reason="Synthetic monitor reported unavailable for a linked resource."
          resolvedAt={
            mode === "resolved-attention" ? "2026-09-25T10:08:00.000Z" : null
          }
          resourceName="Synthetic monitor target"
          ruleId="synthetic.monitor-unavailable"
          severity="critical"
          sourceLabel="Synthetic operational fixture"
          state={mode === "resolved-attention" ? "resolved" : "active"}
        />
      )}
    </div>
  );
}

const meta = {
  title: "Patterns/Synthetic signals",
  component: SyntheticSignals,
  args: { mode: "event" },
} satisfies Meta<typeof SyntheticSignals>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Event: Story = {};
export const ActiveAttention: Story = {
  args: { mode: "active-attention" },
};
export const AttentionProjection: Story = {
  args: { mode: "attention" },
};
export const ResolvedAttention: Story = {
  args: { mode: "resolved-attention" },
};
