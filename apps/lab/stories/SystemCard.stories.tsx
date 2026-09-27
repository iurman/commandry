import type { Meta, StoryObj } from "@storybook/react";
import { SystemCard } from "@commandry/ui";

const meta = {
  title: "Records/SystemCard",
  component: SystemCard,
  parameters: { layout: "centered" },
  args: {
    system: {
      id: "202d3428-322b-4b17-9ed4-f1375d568be4",
      name: "Synthetic Storybook home automation system",
      summary:
        "A local model of cooperating services and resources. This story is a synthetic fixture; it is not live health.",
      lifecycle: "active",
      version: 2,
      domain: { id: "4568b1e5-670d-4724-96de-4a2f361d2764", name: "Home" },
    },
  },
} satisfies Meta<typeof SystemCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
export const Archived: Story = {
  args: {
    system: { ...meta.args.system, lifecycle: "archived" },
  },
};
