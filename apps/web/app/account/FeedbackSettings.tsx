"use client";

import { useEffect, useState } from "react";
import {
  defaultDeviceFeedbackSettings,
  quietHoursActive,
  type DeviceFeedbackSettings,
} from "@commandry/experience";
import {
  FeedbackSettingsPanel,
  type FeedbackSettingsPanelValue,
} from "@commandry/ui";
import {
  playLocalAcknowledgement,
  readDeviceFeedbackSettings,
  saveDeviceFeedbackSettings,
} from "../../lib/device-feedback";

function panelValue(
  settings: DeviceFeedbackSettings,
): FeedbackSettingsPanelValue {
  return {
    ...settings.preferences,
    quietHoursEnabled: settings.quietHours.enabled,
    quietHoursStart: settings.quietHours.start,
    quietHoursEnd: settings.quietHours.end,
  };
}

export default function FeedbackSettings() {
  const [settings, setSettings] = useState<DeviceFeedbackSettings>({
    version: 1,
    preferences: { ...defaultDeviceFeedbackSettings.preferences },
    quietHours: { ...defaultDeviceFeedbackSettings.quietHours },
  });
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [status, setStatus] = useState("Optional channels start off.");

  useEffect(() => {
    const load = () => {
      setSettings(readDeviceFeedbackSettings());
      setNow(new Date());
      setReady(true);
    };
    queueMicrotask(load);
    window.addEventListener("storage", load);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.removeEventListener("storage", load);
      window.clearInterval(timer);
    };
  }, []);

  function change(value: FeedbackSettingsPanelValue) {
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.quietHoursStart) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.quietHoursEnd)
    ) {
      setStatus("Choose valid start and end times before saving.");
      return;
    }
    const next: DeviceFeedbackSettings = {
      version: 1,
      preferences: {
        reducedMotion: value.reducedMotion,
        reducedSensory: value.reducedSensory,
        soundEnabled: value.soundEnabled,
        hapticsEnabled: value.hapticsEnabled,
      },
      quietHours: {
        enabled: value.quietHoursEnabled,
        start: value.quietHoursStart,
        end: value.quietHoursEnd,
      },
    };
    setSettings(next);
    setStatus(
      saveDeviceFeedbackSettings(next)
        ? "Saved in this browser."
        : "Could not save in this browser; these choices last only until this page closes.",
    );
  }

  async function preview() {
    setStatus("Checking this device's optional channels...");
    const result = await playLocalAcknowledgement(settings);
    setStatus(
      `Visual confirmation available. Sound ${result.sound}; vibration ${result.haptics}.`,
    );
  }

  if (!ready || !now)
    return <p role="status">Loading this device&apos;s feedback settings...</p>;

  return (
    <FeedbackSettingsPanel
      value={panelValue(settings)}
      audioAvailable={typeof window.AudioContext === "function"}
      hapticsAvailable={typeof navigator.vibrate === "function"}
      quietHoursActive={quietHoursActive(settings.quietHours, now)}
      status={status}
      onChange={change}
      onPreview={() => void preview()}
    />
  );
}
