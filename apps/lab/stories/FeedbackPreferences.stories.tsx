import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  defaultDeviceFeedbackSettings,
  quietHoursActive,
  resolveFeedbackChannels,
  type DeviceFeedbackSettings,
} from "@commandry/experience";
import {
  FeedbackSettingsPanel,
  type FeedbackSettingsPanelValue,
} from "@commandry/ui";

function PreferencePreview({ startQuiet = false }: { startQuiet?: boolean }) {
  const [settings, setSettings] = useState<DeviceFeedbackSettings>({
    version: 1,
    preferences: { ...defaultDeviceFeedbackSettings.preferences },
    quietHours: {
      ...defaultDeviceFeedbackSettings.quietHours,
      enabled: startQuiet,
    },
  });
  const [status, setStatus] = useState(
    "Lab simulation only; no sound or vibration occurs.",
  );
  const value: FeedbackSettingsPanelValue = {
    ...settings.preferences,
    quietHoursEnabled: settings.quietHours.enabled,
    quietHoursStart: settings.quietHours.start,
    quietHoursEnd: settings.quietHours.end,
  };
  const quiet = quietHoursActive(
    settings.quietHours,
    new Date(2026, 8, 27, 23, 0),
  );
  const channels = resolveFeedbackChannels(settings.preferences, {
    audioAvailable: true,
    hapticsAvailable: true,
    userActivation: true,
    quietHoursActive: quiet,
  });

  function change(next: FeedbackSettingsPanelValue) {
    setSettings({
      version: 1,
      preferences: {
        reducedMotion: next.reducedMotion,
        reducedSensory: next.reducedSensory,
        soundEnabled: next.soundEnabled,
        hapticsEnabled: next.hapticsEnabled,
      },
      quietHours: {
        enabled: next.quietHoursEnabled,
        start: next.quietHoursStart,
        end: next.quietHoursEnd,
      },
    });
    setStatus("Lab settings changed. No device preference was saved.");
  }

  return (
    <div className="lab-preference-preview">
      <p>Lab capabilities below are simulated; playback is disabled here.</p>
      <FeedbackSettingsPanel
        value={value}
        audioAvailable
        hapticsAvailable
        quietHoursActive={quiet}
        status={
          status +
          " Sound " +
          (channels.sound ? "eligible" : "suppressed") +
          "; vibration " +
          (channels.haptics ? "eligible" : "suppressed") +
          "."
        }
        onChange={change}
        onPreview={() =>
          setStatus("Lab preview requested. No sound or vibration occurred.")
        }
      />
    </div>
  );
}

const meta = {
  title: "Foundations/Feedback preferences",
  component: PreferencePreview,
} satisfies Meta<typeof PreferencePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChannelAvailability: Story = {};
export const QuietHours: Story = { args: { startQuiet: true } };
