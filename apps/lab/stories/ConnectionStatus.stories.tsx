import type { Meta, StoryObj } from "@storybook/react";
import { ConnectionStatus } from "@commandry/ui";

const meta = {
  title: "Patterns/Local connection status",
  component: ConnectionStatus,
  args: { state: "reachable" },
  decorators: [
    (Story) => (
      <div style={{ width: "min(100%, 18rem)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConnectionStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reachable: Story = {};
export const DeviceOffline: Story = {
  args: { state: "device_offline" },
};
export const ServerUnavailable: Story = {
  args: { state: "unreachable" },
};
