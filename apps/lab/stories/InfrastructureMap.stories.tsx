import type { Meta, StoryObj } from "@storybook/react";
import { InfrastructureMap } from "@commandry/ui";
const project = { id: "fixture-project", name: "Synthetic Commandry" };
const meta = {
  title: "Patterns/Infrastructure map",
  component: InfrastructureMap,
  args: {
    resources: [
      {
        id: "fixture-host",
        name: "Synthetic host",
        kind: "host",
        telemetry: "reporting",
        projects: [project],
      },
      {
        id: "fixture-web",
        name: "Synthetic web service",
        kind: "service",
        telemetry: "unknown",
        projects: [project],
      },
      {
        id: "fixture-storage",
        name: "Synthetic storage",
        kind: "service",
        telemetry: "stale",
        projects: [project],
      },
    ],
    edges: [
      {
        id: "fixture-parent",
        from: "fixture-host",
        to: "fixture-web",
        type: "contains",
      },
      {
        id: "fixture-dependency",
        from: "fixture-web",
        to: "fixture-storage",
        type: "depends_on",
      },
    ],
    selectedId: "fixture-host",
    onSelect: () => undefined,
    onProject: () => undefined,
  },
  decorators: [
    (Story) => (
      <div className="cmd-network-console">
        <p>
          Synthetic lab fixtures. Reporting is source freshness; service health
          stays unknown.
        </p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InfrastructureMap>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = {};
export const Empty: Story = {
  args: { resources: [], edges: [], selectedId: null },
};
export const Tv: Story = {
  decorators: [
    (Story) => (
      <div className="cmd-network-tv">
        <Story />
      </div>
    ),
  ],
};
