"use client";

import { useEffect } from "react";
import {
  applyDeviceMotionPreference,
  DEVICE_FEEDBACK_CHANGED_EVENT,
  readDeviceFeedbackSettings,
} from "../../lib/device-feedback";

export function FeedbackPreferenceBridge() {
  useEffect(() => {
    const apply = () =>
      applyDeviceMotionPreference(readDeviceFeedbackSettings());
    apply();
    window.addEventListener("storage", apply);
    window.addEventListener(DEVICE_FEEDBACK_CHANGED_EVENT, apply);
    return () => {
      window.removeEventListener("storage", apply);
      window.removeEventListener(DEVICE_FEEDBACK_CHANGED_EVENT, apply);
    };
  }, []);
  return null;
}
