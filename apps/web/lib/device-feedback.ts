import {
  defaultDeviceFeedbackSettings,
  parseDeviceFeedbackSettings,
  quietHoursActive,
  resolveFeedbackChannels,
  type DeviceFeedbackSettings,
} from "@commandry/experience";

export const DEVICE_FEEDBACK_STORAGE_KEY = "commandry.feedback-settings.v1";
export const DEVICE_FEEDBACK_CHANGED_EVENT =
  "commandry:feedback-settings-changed";

export type FeedbackPreviewResult = {
  sound:
    | "off"
    | "suppressed"
    | "unavailable"
    | "blocked"
    | "rate-limited"
    | "scheduled";
  haptics:
    | "off"
    | "suppressed"
    | "unavailable"
    | "blocked"
    | "rate-limited"
    | "requested";
};

let lastCueAt = 0;

export function readDeviceFeedbackSettings(): DeviceFeedbackSettings {
  if (typeof window === "undefined")
    return parseDeviceFeedbackSettings(defaultDeviceFeedbackSettings);
  try {
    const stored = window.localStorage.getItem(DEVICE_FEEDBACK_STORAGE_KEY);
    return parseDeviceFeedbackSettings(stored ? JSON.parse(stored) : null);
  } catch {
    return parseDeviceFeedbackSettings(null);
  }
}

export function saveDeviceFeedbackSettings(
  settings: DeviceFeedbackSettings,
): boolean {
  try {
    window.localStorage.setItem(
      DEVICE_FEEDBACK_STORAGE_KEY,
      JSON.stringify(parseDeviceFeedbackSettings(settings)),
    );
    window.dispatchEvent(new Event(DEVICE_FEEDBACK_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function applyDeviceMotionPreference(
  settings: DeviceFeedbackSettings,
): void {
  document.documentElement.dataset.reducedMotion = String(
    settings.preferences.reducedMotion,
  );
  document.documentElement.dataset.reducedSensory = String(
    settings.preferences.reducedSensory,
  );
}

async function playSoftAcknowledgementTone(): Promise<boolean> {
  let context: AudioContext | null = null;
  try {
    context = new window.AudioContext();
    if (context.state !== "running") await context.resume();
    if (context.state !== "running") {
      await context.close();
      return false;
    }
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.018, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.addEventListener(
      "ended",
      () => {
        void context?.close().catch(() => {});
      },
      { once: true },
    );
    oscillator.start(start);
    oscillator.stop(start + 0.11);
    return true;
  } catch {
    if (context) void context.close().catch(() => {});
    return false;
  }
}

export async function playLocalAcknowledgement(
  settings: DeviceFeedbackSettings = readDeviceFeedbackSettings(),
): Promise<FeedbackPreviewResult> {
  const quiet = quietHoursActive(settings.quietHours, new Date());
  const capabilities = {
    audioAvailable: typeof window.AudioContext === "function",
    hapticsAvailable: typeof navigator.vibrate === "function",
    userActivation: navigator.userActivation?.isActive ?? true,
    quietHoursActive: quiet,
  };
  const channels = resolveFeedbackChannels(settings.preferences, capabilities);
  const suppressed = settings.preferences.reducedSensory || quiet;
  const sound: FeedbackPreviewResult["sound"] = !settings.preferences
    .soundEnabled
    ? "off"
    : suppressed
      ? "suppressed"
      : !capabilities.audioAvailable || !capabilities.userActivation
        ? "unavailable"
        : "blocked";
  const haptics: FeedbackPreviewResult["haptics"] = !settings.preferences
    .hapticsEnabled
    ? "off"
    : suppressed
      ? "suppressed"
      : !capabilities.hapticsAvailable || !capabilities.userActivation
        ? "unavailable"
        : "blocked";
  if (!channels.sound && !channels.haptics) return { sound, haptics };
  const now = Date.now();
  if (now - lastCueAt < 1_200)
    return {
      sound: channels.sound ? "rate-limited" : sound,
      haptics: channels.haptics ? "rate-limited" : haptics,
    };
  lastCueAt = now;
  let hapticResult: FeedbackPreviewResult["haptics"] = haptics;
  if (channels.haptics) {
    try {
      hapticResult = navigator.vibrate(12) ? "requested" : "blocked";
    } catch {
      hapticResult = "blocked";
    }
  }
  return {
    sound: channels.sound
      ? (await playSoftAcknowledgementTone())
        ? "scheduled"
        : "blocked"
      : sound,
    haptics: hapticResult,
  };
}
