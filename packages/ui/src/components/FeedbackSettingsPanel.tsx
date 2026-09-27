import { Button } from "./Button";

export type FeedbackSettingsPanelValue = {
  reducedMotion: boolean;
  reducedSensory: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export interface FeedbackSettingsPanelProps {
  value: FeedbackSettingsPanelValue;
  audioAvailable: boolean;
  hapticsAvailable: boolean;
  quietHoursActive: boolean;
  status: string;
  onChange: (value: FeedbackSettingsPanelValue) => void;
  onPreview: () => void;
}

export function FeedbackSettingsPanel({
  value,
  audioAvailable,
  hapticsAvailable,
  quietHoursActive,
  status,
  onChange,
  onPreview,
}: FeedbackSettingsPanelProps) {
  return (
    <section className="cmd-workspace-section" aria-labelledby="feedback-title">
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Device-local control</p>
          <h2 id="feedback-title">Feedback on this device</h2>
        </div>
      </div>
      <p>
        These settings stay in this browser. Visual status and history remain
        available when optional sound, vibration, and motion are suppressed.
        Synthetic events and background updates never autoplay a cue.
      </p>
      <div className="cmd-form">
        <fieldset>
          <legend>Channels</legend>
          <label className="cmd-attention-check">
            <input
              type="checkbox"
              checked={value.reducedMotion}
              onChange={(event) =>
                onChange({ ...value, reducedMotion: event.target.checked })
              }
            />
            Reduce motion
          </label>
          <label className="cmd-attention-check">
            <input
              type="checkbox"
              checked={value.reducedSensory}
              onChange={(event) =>
                onChange({ ...value, reducedSensory: event.target.checked })
              }
            />
            Reduce all optional sensory feedback
          </label>
          <label className="cmd-attention-check">
            <input
              type="checkbox"
              checked={value.soundEnabled}
              onChange={(event) =>
                onChange({ ...value, soundEnabled: event.target.checked })
              }
            />
            Enable soft acknowledgement sound
          </label>
          <label className="cmd-attention-check">
            <input
              type="checkbox"
              checked={value.hapticsEnabled}
              onChange={(event) =>
                onChange({ ...value, hapticsEnabled: event.target.checked })
              }
            />
            Enable supported-device vibration
          </label>
        </fieldset>
        <fieldset>
          <legend>Quiet hours in this device&apos;s local time</legend>
          <label className="cmd-attention-check">
            <input
              type="checkbox"
              checked={value.quietHoursEnabled}
              onChange={(event) =>
                onChange({ ...value, quietHoursEnabled: event.target.checked })
              }
            />
            Enable quiet hours
          </label>
          <label htmlFor="feedback-quiet-start">Start</label>
          <input
            id="feedback-quiet-start"
            type="time"
            value={value.quietHoursStart}
            onChange={(event) =>
              onChange({ ...value, quietHoursStart: event.target.value })
            }
          />
          <label htmlFor="feedback-quiet-end">End</label>
          <input
            id="feedback-quiet-end"
            type="time"
            value={value.quietHoursEnd}
            onChange={(event) =>
              onChange({ ...value, quietHoursEnd: event.target.value })
            }
          />
          <p className="cmd-form-hint">
            Matching start and end makes quiet hours active all day. Quiet hours
            are {quietHoursActive ? "active" : "inactive"} now.
          </p>
        </fieldset>
        <p className="cmd-form-hint">
          Audio API is {audioAvailable ? "available" : "unavailable"} here;
          vibration API is {hapticsAvailable ? "available" : "unavailable"}
          here. Physical output has not been verified on this device.
        </p>
        <div className="cmd-attention-actions">
          <Button onClick={onPreview}>Preview acknowledgement</Button>
        </div>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </section>
  );
}
