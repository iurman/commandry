import type { Meta, StoryObj } from "@storybook/react";
import { DomainCard } from "@commandry/ui";

const meta = {
  title: "Records/DomainCard",
  component: DomainCard,
  parameters: { layout: "centered" },
  args: {
    domain: {
      id: "2056a4f1-1994-4582-9765-85d12152229d",
      name: "Synthetic Storybook home operations",
      description:
        "A durable area for related projects and systems. This story is a synthetic local fixture.",
      lifecycle: "active",
      version: 2,
    },
  },
} satisfies Meta<typeof DomainCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
export const Archived: Story = {
  args: {
    domain: { ...meta.args.domain, lifecycle: "archived" },
  },
};
