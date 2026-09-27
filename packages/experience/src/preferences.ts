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

export interface QuietHoursSchedule {
  enabled: boolean;
  start: string;
  end: string;
}

export interface DeviceFeedbackSettings {
  version: 1;
  preferences: FeedbackPreferences;
  quietHours: QuietHoursSchedule;
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

export const defaultDeviceFeedbackSettings: Readonly<DeviceFeedbackSettings> = {
  version: 1,
  preferences: defaultFeedbackPreferences,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour !== undefined && minute !== undefined && hour < 24 && minute < 60;
}

export function parseDeviceFeedbackSettings(
  value: unknown,
): DeviceFeedbackSettings {
  const fallback = (): DeviceFeedbackSettings => ({
    version: 1,
    preferences: { ...defaultFeedbackPreferences },
    quietHours: { ...defaultDeviceFeedbackSettings.quietHours },
  });
  if (!isRecord(value) || value.version !== 1) return fallback();
  const preferences = value.preferences;
  const quietHours = value.quietHours;
  if (!isRecord(preferences) || !isRecord(quietHours)) return fallback();
  const keys = [
    "reducedMotion",
    "reducedSensory",
    "soundEnabled",
    "hapticsEnabled",
  ] as const;
  if (
    keys.some((key) => typeof preferences[key] !== "boolean") ||
    typeof quietHours.enabled !== "boolean" ||
    !isLocalTime(quietHours.start) ||
    !isLocalTime(quietHours.end)
  )
    return fallback();
  return {
    version: 1,
    preferences: {
      reducedMotion: preferences.reducedMotion as boolean,
      reducedSensory: preferences.reducedSensory as boolean,
      soundEnabled: preferences.soundEnabled as boolean,
      hapticsEnabled: preferences.hapticsEnabled as boolean,
    },
    quietHours: {
      enabled: quietHours.enabled,
      start: quietHours.start,
      end: quietHours.end,
    },
  };
}

export function quietHoursActive(
  schedule: Readonly<QuietHoursSchedule>,
  at: Date,
): boolean {
  if (
    !schedule.enabled ||
    !isLocalTime(schedule.start) ||
    !isLocalTime(schedule.end)
  )
    return false;
  const current = at.getHours() * 60 + at.getMinutes();
  const [startHour, startMinute] = schedule.start.split(":").map(Number);
  const [endHour, endMinute] = schedule.end.split(":").map(Number);
  const start = startHour! * 60 + startMinute!;
  const end = endHour! * 60 + endMinute!;
  if (start === end) return true;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

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
