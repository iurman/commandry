import type { Meta, StoryObj } from "@storybook/react";
import { SavedViewToolbar } from "@commandry/ui";

const meta = {
  title: "Records/SavedViewToolbar",
  component: SavedViewToolbar,
  args: {
    surface: "Work",
    name: "Urgent open work",
    selectedId: "b9c0584e-1400-45a5-a226-ce23b0be657d",
    options: [
      {
        id: "b9c0584e-1400-45a5-a226-ce23b0be657d",
        name: "Urgent open work",
      },
    ],
    busy: false,
    hasMore: false,
    onNameChange: () => undefined,
    onSelect: () => undefined,
    onCreate: () => undefined,
    onUpdate: () => undefined,
    onArchive: () => undefined,
    onLoadMore: () => undefined,
    error: null,
    notice: "Saved view updated. Results are current.",
  },
} satisfies Meta<typeof SavedViewToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Selected: Story = {};
export const Empty: Story = {
  args: {
    selectedId: "",
    options: [],
    name: "",
    notice: null,
  },
};
