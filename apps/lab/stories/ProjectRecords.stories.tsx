import type { Meta, StoryObj } from "@storybook/react";
import {
  RecordCard,
  RecordEmptyState,
  RelationshipCard,
  StatusBadge,
} from "@commandry/ui";

function ProjectRecords({
  mode,
}: {
  mode: "populated" | "empty" | "simulated" | "directional";
}) {
  if (mode === "empty") {
    return (
      <div className="lab-stack">
        <p>Empty portfolio state. Create a record before showing any health.</p>
        <RecordEmptyState
          description="Create a project to start connecting resources, work, and knowledge."
          title="No projects yet"
        />
      </div>
    );
  }

  return (
    <div className="lab-stack">
      <p>
        {mode === "directional"
          ? "Synthetic directional relationship. This manual resource is not observed."
          : "Synthetic lab fixture. No live source or operational observation is connected."}
      </p>
      <RecordCard
        aside={
          <StatusBadge dimension="lifecycle" label="active" tone="neutral" />
        }
        description="A local demonstration of one record linked into project context."
        href="#project-example"
        id="4fbf716c-bb52-450b-aa03-ae59f1482047"
        kind="software"
        name="Harbor notes"
      />
      <ul className="cmd-record-list">
        <RelationshipCard
          id="6814239d-207e-4f23-ae2d-cf44b170f01b"
          inverseType={mode === "directional" ? "supported_by" : "relates_to"}
          resource={{
            id: "ba9c969f-a376-40ef-85e5-73c9d762eb1d",
            kind: "repository",
            name: "Harbor notes source",
            subtype: "Git repository",
            state: null,
            externalUrl: null,
            lastObservedAt: null,
          }}
          type={mode === "directional" ? "supports" : "relates_to"}
        />
      </ul>
    </div>
  );
}

const meta = {
  title: "Patterns/Project records",
  component: ProjectRecords,
  args: { mode: "populated" },
} satisfies Meta<typeof ProjectRecords>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { mode: "empty" } };
export const SyntheticUnknown: Story = { args: { mode: "simulated" } };
export const DirectionalSupport: Story = { args: { mode: "directional" } };
