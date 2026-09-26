import type { Meta, StoryObj } from "@storybook/react";
import { KnowledgeRevisionCard } from "@commandry/ui";

const meta = {
  title: "Records/KnowledgeRevisionCard",
  component: KnowledgeRevisionCard,
  parameters: { layout: "centered" },
  args: {
    revision: {
      id: "d13efb1f-9451-4cc1-8fa2-75dbe381f3fe",
      version: 2,
      previousTitle: "Garden timer idea",
      previousContent:
        "Original filed note based on a synthetic Storybook capture.",
      title: "Garden timer options",
      content: "Compare two timer replacements before making a decision.",
      createdAt: "2026-09-26T12:00:00.000Z",
    },
  },
} satisfies Meta<typeof KnowledgeRevisionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
