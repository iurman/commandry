import type { Meta, StoryObj } from "@storybook/react";
import { WorkProjectLinkCard } from "@commandry/ui";

const meta = {
  title: "Records/WorkProjectLinkCard",
  component: WorkProjectLinkCard,
  parameters: { layout: "centered" },
  args: {
    relation: {
      projectId: "69d5509d-343c-4a88-a728-cc1373c28f25",
      projectName: "Synthetic Storybook shared project",
      linkId: "9f66b812-3d59-448b-840c-1100f67637b5",
      lifecycle: "active",
      recordedAt: "2026-09-26T12:00:00.000Z",
    },
  },
} satisfies Meta<typeof WorkProjectLinkCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
export const Archived: Story = {
  args: { relation: { ...meta.args.relation, lifecycle: "archived" } },
};
