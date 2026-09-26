/**
 * Channel availability only. Semantic intents, assets, and playback policy
 * remain open product decisions.
 */
export interface FeedbackPreferences {
  reducedMotion: boolean;
  reducedSensory: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

export interface FeedbackCapabilities {
  audioAvailable: boolean;
  hapticsAvailable: boolean;
  userActivation: boolean;
  quietHoursActive: boolean;
}

export interface FeedbackChannels {
  visual: true;
  motion: boolean;
  sound: boolean;
  haptics: boolean;
}

export const defaultFeedbackPreferences: Readonly<FeedbackPreferences> = {
  reducedMotion: false,
  reducedSensory: false,
  soundEnabled: false,
  hapticsEnabled: false,
};

export function resolveFeedbackChannels(
  preferences: Readonly<FeedbackPreferences>,
  capabilities: Readonly<FeedbackCapabilities>,
): FeedbackChannels {
  const sensoryAllowed =
    !preferences.reducedSensory && !capabilities.quietHoursActive;

  return {
    visual: true,
    motion: !preferences.reducedMotion && !preferences.reducedSensory,
    sound:
      sensoryAllowed &&
      preferences.soundEnabled &&
      capabilities.audioAvailable &&
      capabilities.userActivation,
    haptics:
      sensoryAllowed &&
      preferences.hapticsEnabled &&
      capabilities.hapticsAvailable &&
      capabilities.userActivation,
  };
}
