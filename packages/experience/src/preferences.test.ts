import { describe, expect, it } from "vitest";
import {
  defaultFeedbackPreferences,
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
