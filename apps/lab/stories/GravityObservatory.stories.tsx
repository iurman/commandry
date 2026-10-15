import type { Meta, StoryObj } from "@storybook/react";
import { GravityObservatory } from "./gravity/GravityObservatory";

const meta = {
  title: "Experiments/Gravity Observatory",
  component: GravityObservatory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof GravityObservatory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Study: Story = {};
