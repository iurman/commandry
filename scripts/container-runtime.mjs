import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const candidates = [
  { command: "docker", prefix: [], description: "docker" },
  {
    command: "flatpak-spawn",
    prefix: ["--host", join(homedir(), ".local/bin/docker")],
    description: "host Podman through Toolbx",
  },
  {
    command: "flatpak-spawn",
    prefix: ["--host", "/usr/bin/docker"],
    description: "host Docker-compatible CLI through Toolbx",
  },
];

export function runContainer(runtime, args, options = {}) {
  return spawnSync(runtime.command, [...runtime.prefix, ...args], options);
}

export function detectContainerRuntime() {
  for (const candidate of candidates) {
    const version = runContainer(candidate, ["compose", "version"], {
      encoding: "utf8",
    });
    if (version.status === 0) {
      return { ...candidate, version: version.stdout.trim() };
    }
  }
  return null;
}
