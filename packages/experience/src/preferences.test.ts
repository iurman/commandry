import { describe, expect, it } from "vitest";
import {
  defaultDeviceFeedbackSettings,
  defaultFeedbackPreferences,
  parseDeviceFeedbackSettings,
  quietHoursActive,
  resolveFeedbackChannels,
} from "./preferences";

const available = {
  audioAvailable: true,
  hapticsAvailable: true,
  userActivation: true,
  quietHoursActive: false,
};

describe("feedback channel availability", () => {
  it("keeps visual feedback while optional channels start silent", () => {
    expect(
      resolveFeedbackChannels(defaultFeedbackPreferences, available),
    ).toEqual({
      visual: true,
      motion: true,
      sound: false,
      haptics: false,
    });
  });

  it("suppresses motion separately from opted-in sound and haptics", () => {
    expect(
      resolveFeedbackChannels(
        {
          reducedMotion: true,
          reducedSensory: false,
          soundEnabled: true,
          hapticsEnabled: true,
        },
        available,
      ),
    ).toEqual({ visual: true, motion: false, sound: true, haptics: true });
  });

  it("respects reduced sensory mode and quiet hours", () => {
    const preferences = {
      reducedMotion: false,
      reducedSensory: true,
      soundEnabled: true,
      hapticsEnabled: true,
    };
    expect(resolveFeedbackChannels(preferences, available)).toEqual({
      visual: true,
      motion: false,
      sound: false,
      haptics: false,
    });
    expect(
      resolveFeedbackChannels(
        { ...preferences, reducedSensory: false },
        { ...available, quietHoursActive: true },
      ),
    ).toEqual({ visual: true, motion: true, sound: false, haptics: false });
  });
});

describe("device feedback settings", () => {
  it("starts silent and rejects partial or malformed stored preferences", () => {
    expect(parseDeviceFeedbackSettings(null)).toEqual(
      defaultDeviceFeedbackSettings,
    );
    expect(
      parseDeviceFeedbackSettings({
        version: 1,
        preferences: { soundEnabled: true },
        quietHours: { enabled: true, start: "25:00", end: "07:00" },
      }),
    ).toEqual(defaultDeviceFeedbackSettings);
    expect(
      parseDeviceFeedbackSettings({
        version: 1,
        preferences: {
          reducedMotion: true,
          reducedSensory: false,
          soundEnabled: true,
          hapticsEnabled: true,
        },
        quietHours: { enabled: true, start: "22:00", end: "07:00" },
      }).preferences.soundEnabled,
    ).toBe(true);
  });

  it("applies device-local quiet hours across midnight and all-day schedules", () => {
    const schedule = { enabled: true, start: "22:00", end: "07:00" };
    expect(quietHoursActive(schedule, new Date(2026, 8, 27, 23, 30))).toBe(
      true,
    );
    expect(quietHoursActive(schedule, new Date(2026, 8, 28, 6, 59))).toBe(true);
    expect(quietHoursActive(schedule, new Date(2026, 8, 28, 7, 0))).toBe(false);
    expect(
      quietHoursActive(
        { enabled: true, start: "09:00", end: "09:00" },
        new Date(2026, 8, 28, 14, 0),
      ),
    ).toBe(true);
    expect(quietHoursActive({ ...schedule, enabled: false }, new Date())).toBe(
      false,
    );
  });
});
