import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  defaultFeedbackPreferences,
  resolveFeedbackChannels,
  type FeedbackPreferences,
} from "@commandry/experience";

function PreferencePreview() {
  const [preferences, setPreferences] = useState<FeedbackPreferences>({
    ...defaultFeedbackPreferences,
  });
  const [quietHoursActive, setQuietHoursActive] = useState(false);
  const channels = resolveFeedbackChannels(preferences, {
    audioAvailable: true,
    hapticsAvailable: true,
    userActivation: true,
    quietHoursActive,
  });

  function updatePreference(key: keyof FeedbackPreferences, value: boolean) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="lab-preference-preview">
      <h2>Feedback preference preview</h2>
      <p>
        This simulates channel availability. It never plays sound or triggers
        vibration.
      </p>
      <fieldset>
        <legend>Preferences</legend>
        {(
          [
            ["reducedMotion", "Reduce motion"],
            ["reducedSensory", "Reduce sensory feedback"],
            ["soundEnabled", "Enable sound"],
            ["hapticsEnabled", "Enable haptics"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input
              checked={preferences[key]}
              onChange={(event) => updatePreference(key, event.target.checked)}
              type="checkbox"
            />
            {label}
          </label>
        ))}
        <label>
          <input
            checked={quietHoursActive}
            onChange={(event) => setQuietHoursActive(event.target.checked)}
            type="checkbox"
          />
          Quiet hours active
        </label>
      </fieldset>
      <output aria-live="polite">
        Visual: {channels.visual ? "available" : "unavailable"}
        {"\n"}
        Motion: {channels.motion ? "available" : "suppressed"}
        {"\n"}
        Sound: {channels.sound ? "eligible" : "suppressed"}
        {"\n"}
        Haptics: {channels.haptics ? "eligible" : "suppressed"}
      </output>
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
