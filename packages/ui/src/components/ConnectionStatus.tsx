export type ConnectionState =
  "checking" | "reachable" | "device_offline" | "unreachable";

const copy: Record<ConnectionState, { label: string; detail: string }> = {
  checking: {
    label: "Checking local app",
    detail: "Checking whether this browser can reach Commandry.",
  },
  reachable: {
    label: "Local app reachable",
    detail:
      "This browser reached Commandry. Source data has its own freshness labels.",
  },
  device_offline: {
    label: "Device offline",
    detail: "Work needs a connection. Only the offline help page is available.",
  },
  unreachable: {
    label: "Cannot reach local app",
    detail: "Check the local server and your device's network connection.",
  },
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const message = copy[state];
  return (
    <div
      className={`cmd-connection-status cmd-connection-${state}`}
      role="status"
    >
      <span className="cmd-connection-label">{message.label}</span>
      <span className="cmd-connection-detail">{message.detail}</span>
    </div>
  );
}
