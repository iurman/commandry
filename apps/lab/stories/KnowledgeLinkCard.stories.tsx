import type { Meta, StoryObj } from "@storybook/react";
import { KnowledgeLinkCard } from "@commandry/ui";

const meta = {
  title: "Records/KnowledgeLinkCard",
  component: KnowledgeLinkCard,
  args: {
    link: {
      id: "a7b494f7-b0a0-4d2e-bd67-ed0acc7545b9",
      projectId: "498562cc-2b45-4a43-98f6-570d7dc3104d",
      projectName: "Garden planning",
      sourceCaptureId: "83b6e4c3-3689-43ad-ace5-8069dc2c6b67",
      title: "Field guide for the garden timer",
      content: "Use this reference during the maintenance task.",
      url: "https://example.test/field-guide",
    },
  },
} satisfies Meta<typeof KnowledgeLinkCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Saved: Story = {};
