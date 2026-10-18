import { brandIcons } from "./brand-icons";

export type ResourceIconGroup = "kind" | "platform" | "service" | "os" | "game";
export type ResourceIcon = {
  id: string;
  title: string;
  group: ResourceIconGroup;
  /** 24x24 path data, drawn with the even-odd rule. */
  path: string;
  /** Brand colour, when the logo has one. */
  hex?: string;
};
/** A host's reported operating system identity (a scene platform observation). */
export type ResourcePlatform = {
  osId: string;
  osIdLike: readonly string[];
  platform: string | null;
};
type IconSubject = {
  kind: string;
  label: string;
  platform?: ResourcePlatform | undefined;
};

// Original generic glyphs. They name what a resource is when no technology is known.
const glyphs: ResourceIcon[] = [
  {
    id: "server",
    title: "Server",
    group: "kind",
    path: "M4 3h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm0 10h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Zm3 2.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm0-10a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM11 6v2h7V6h-7Zm0 10v2h7v-2h-7Z",
  },
  {
    id: "service",
    title: "Service",
    group: "kind",
    path: "m12 2 8.66 5v10L12 22l-8.66-5V7L12 2Zm0 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  },
  {
    id: "deployment",
    title: "Deployment",
    group: "kind",
    path: "M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.25 6.5 3.25L12 10.75 5.5 7.5 12 4.25ZM5 9.1l6 3v7.4l-6-3V9.1Zm8 10.4v-7.4l6-3v7.4l-6 3Z",
  },
  {
    id: "provider",
    title: "Provider",
    group: "kind",
    path: "M6.5 19a4.5 4.5 0 0 1-.68-8.95 6.5 6.5 0 0 1 12.36 1.02A4 4 0 0 1 17.5 19h-11Z",
  },
  {
    id: "repository",
    title: "Repository",
    group: "kind",
    path: "M6 2h12a2 2 0 0 1 2 2v17a1 1 0 0 1-1 1H7a3 3 0 0 1-3-3V4a2 2 0 0 1 2-2Zm1 15a1 1 0 1 0 0 2h11v-2H7Zm2-12v2h7V5H9Z",
  },
  {
    id: "collection",
    title: "Collection",
    group: "kind",
    path: "M12 2.5 2 7.5l10 5 10-5-10-5Zm-7.6 8.2L2 11.9l10 5 10-5-2.4-1.2L12 14.5l-7.6-3.8Zm0 4.4L2 16.3l10 5 10-5-2.4-1.2L12 18.9l-7.6-3.8Z",
  },
  {
    id: "project",
    title: "Project",
    group: "kind",
    path: "M3 6a2 2 0 0 1 2-2h4.17a2 2 0 0 1 1.42.59L12 6h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z",
  },
  {
    id: "reference",
    title: "Shared reference",
    group: "kind",
    path: "M10.6 7.05 12.7 4.9a5 5 0 0 1 7.07 7.07l-2.12 2.12-1.42-1.41 2.12-2.12a3 3 0 1 0-4.24-4.25L12 8.46 10.6 7.05Zm2.83 9.9-2.12 2.12a5 5 0 1 1-7.07-7.07l2.12-2.12 1.42 1.41-2.13 2.13a3 3 0 1 0 4.25 4.24l2.12-2.12 1.41 1.41Zm-5.66-2.83 6.36-6.36 1.42 1.41-6.37 6.37-1.41-1.42Z",
  },
  {
    // A block glyph, not the Minecraft logo, which is not freely licensed.
    id: "minecraft",
    title: "Minecraft server",
    group: "game",
    hex: "#62b047",
    path: "M12 2.6 20.2 7 12 11.4 3.8 7 12 2.6ZM3 8.6l8.2 4.4v8.8L3 17.4V8.6Zm2 3v2.2l2 1.1v-2.2l-2-1.1Zm4 4.3v2.2l1.2.6v-2.2L9 15.9Zm11-7.3v8.8l-8.2 4.4V13l8.2-4.4Zm-2 3-2 1.1v2.2l2-1.1v-2.2Zm-4 4.3-1.2.6v2.2l1.2-.6v-2.2Z",
  },
];

export const resourceIcons: readonly ResourceIcon[] = [
  ...glyphs,
  ...brandIcons.map((icon) => ({ ...icon })),
];
const byId = new Map(resourceIcons.map((icon) => [icon.id, icon]));
export const resourceIcon = (id: string | undefined) =>
  id ? byId.get(id) : undefined;

const kindGlyph: Record<string, string> = {
  host: "server",
  service: "service",
  deployment: "deployment",
  provider: "provider",
  repository: "github",
  collection: "collection",
  project: "project",
  reference: "reference",
};

// Conservative, whole-word name hints. They only choose a picture; the owner can
// replace any of them, and they never infer mappings, roles or placement.
const hints: [RegExp, string][] = [
  [/\bhome[ _-]?assistant\b|\bhass(?:io)?\b|\bhaos\b/, "homeassistant"],
  [/minecraft/, "minecraft"],
  [/\bproxmox\b|\bpve\d*\b/, "proxmox"],
  [/\bcloudflare\b/, "cloudflare"],
  [/\bgithub\b/, "github"],
  [/\bvercel\b/, "vercel"],
  [/\btailscale\b/, "tailscale"],
  [/\bnamecheap\b/, "namecheap"],
  [/\bwireguard\b/, "wireguard"],
  [/\bkubernetes\b|\bk8s\b|\bk3s\b/, "kubernetes"],
  [/\bdocker\b/, "docker"],
  [/\bpostgres(?:ql)?\b/, "postgresql"],
  [/\bmariadb\b/, "mariadb"],
  [/\bmysql\b/, "mysql"],
  [/\bredis\b/, "redis"],
  [/\bmongo(?:db)?\b/, "mongodb"],
  [/\bcaddy\b/, "caddy"],
  [/\bnginx\b/, "nginx"],
  [/\btraefik\b/, "traefikproxy"],
  [/\bgrafana\b/, "grafana"],
  [/\bnetdata\b/, "netdata"],
  [/\buptime[ _-]?kuma\b/, "uptimekuma"],
  [/\bportainer\b/, "portainer"],
  [/\btruenas\b/, "truenas"],
  [/\bunraid\b/, "unraid"],
  [/\bjellyfin\b/, "jellyfin"],
  [/\bplex\b/, "plex"],
  [/\bnextcloud\b/, "nextcloud"],
  [/\bpi[ _-]?hole\b/, "pihole"],
  [/\badguard\b/, "adguard"],
  [/\bimmich\b/, "immich"],
  [/\bvaultwarden\b/, "vaultwarden"],
  [/\bpterodactyl\b/, "pterodactyl"],
  [/\braspberry[ _-]?pi\b|\brpi\d*\b/, "raspberrypi"],
  [/\bopnsense\b/, "opnsense"],
  [/\bpfsense\b/, "pfsense"],
  [/\bopenwrt\b/, "openwrt"],
  [/\bdebian\b/, "debian"],
  [/\bubuntu\b/, "ubuntu"],
  [/\bfedora\b/, "fedora"],
  [/\barch(?:linux)?\b/, "archlinux"],
  [/\balpine\b/, "alpinelinux"],
  [/\bcentos\b/, "centos"],
  [/\balma(?:linux)?\b/, "almalinux"],
  [/\bopensuse\b/, "opensuse"],
  [/\bfreebsd\b/, "freebsd"],
];

// os-release IDs with a vendored logo. Anything else uses its ID_LIKE family.
const osIcons: Record<string, string> = {
  debian: "debian",
  raspbian: "raspberrypi",
  ubuntu: "ubuntu",
  linuxmint: "linuxmint",
  pop: "popos",
  fedora: "fedora",
  centos: "centos",
  almalinux: "almalinux",
  arch: "archlinux",
  archarm: "archlinux",
  manjaro: "manjaro",
  "manjaro-arm": "manjaro",
  alpine: "alpinelinux",
  opensuse: "opensuse",
  "opensuse-leap": "opensuse",
  "opensuse-tumbleweed": "opensuse",
  "opensuse-microos": "opensuse",
  openwrt: "openwrt",
  haos: "homeassistant",
  freebsd: "freebsd",
};

/** The icon a reported platform names: a detected platform such as Proxmox VE,
 * then the exact distribution, then the closest ID_LIKE family, else Linux. */
export function platformIconId(platform: ResourcePlatform): string {
  if (platform.platform === "proxmox-ve") return "proxmox";
  for (const id of [platform.osId, ...platform.osIdLike])
    if (Object.hasOwn(osIcons, id)) return osIcons[id]!;
  return "linux";
}

/** The automatic icon: a host's reported operating system, else a recognised
 * technology in the resource's own name, else its kind. Repositories show the
 * GitHub mark; an approved repository logo replaces it in the badge.
 */
export function defaultResourceIconId(subject: IconSubject): string {
  if (subject.kind === "host" && subject.platform)
    return platformIconId(subject.platform);
  if (subject.kind !== "collection" && subject.kind !== "project") {
    const name = subject.label.toLocaleLowerCase();
    for (const [pattern, id] of hints) if (pattern.test(name)) return id;
  }
  return kindGlyph[subject.kind] ?? "collection";
}

/** An owner choice wins when it still names a known icon. */
export function resolveResourceIcon(
  subject: IconSubject,
  chosen?: string,
): ResourceIcon {
  return (
    resourceIcon(chosen) ??
    resourceIcon(defaultResourceIconId(subject)) ??
    glyphs[0]!
  );
}

/** Brand colour when it stays legible on the current surface, else none. */
export function legibleBrandColor(
  icon: ResourceIcon,
  theme: "porcelain" | "midnight",
): string | undefined {
  if (!icon.hex) return undefined;
  const value = Number.parseInt(icon.hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  // Contrast against the label panels (#101e29 at night, #fdfcf8 by day).
  const contrast =
    theme === "midnight"
      ? (luminance + 0.05) / (0.012 + 0.05)
      : (0.97 + 0.05) / (luminance + 0.05);
  return contrast >= 3 ? icon.hex : undefined;
}
