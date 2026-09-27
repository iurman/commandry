"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ConnectionStatus, type ConnectionState } from "@commandry/ui";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaStatus() {
  const [state, setState] = useState<ConnectionState>("checking");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [secure, setSecure] = useState(true);
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      setTarget(document.querySelector("[data-commandry-device-status]"));
      setSecure(window.isSecureContext);
    });
    async function check() {
      if (!navigator.onLine) {
        setState("device_offline");
        return;
      }
      try {
        const response = await fetch("/", {
          method: "HEAD",
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        if (active)
          setState(
            !navigator.onLine
              ? "device_offline"
              : response.ok
                ? "reachable"
                : "unreachable",
          );
      } catch {
        if (active)
          setState(navigator.onLine ? "unreachable" : "device_offline");
      }
    }
    function onOffline() {
      setState("device_offline");
    }
    function onInstall(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    function onInstalled() {
      setInstallPrompt(null);
    }
    window.addEventListener("online", check);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    const interval = window.setInterval(check, 30_000);
    void check();
    if (window.isSecureContext && "serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => undefined);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function requestInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (!target) return null;

  return createPortal(
    <div className="cmd-device-status">
      <ConnectionStatus state={state} />
      <details className="cmd-device-details">
        <summary>Phone and offline use</summary>
        <p>
          The local network preview works in a browser. It uses HTTP, so browser
          installation and offline help require HTTPS or localhost.
        </p>
        <p>
          Commandry does not store project pages or API results for offline use.
          Reconnect before creating or changing records.
        </p>
        {installPrompt && (
          <button
            className="cmd-device-install"
            type="button"
            onClick={() => void requestInstall()}
          >
            Install Commandry
          </button>
        )}
        {!secure && <p>Installation is unavailable on this HTTP origin.</p>}
      </details>
    </div>,
    target,
  );
}
