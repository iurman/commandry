import { describe, expect, it } from "vitest";
import { brandIcons } from "./brand-icons";
import {
  defaultResourceIconId,
  platformIconId,
  legibleBrandColor,
  resolveResourceIcon,
  resourceIcon,
  resourceIcons,
} from "./resource-icons";

describe("resource icons", () => {
  it("chooses a kind glyph, the GitHub mark for repositories and whole-word technology names", () => {
    expect(defaultResourceIconId({ kind: "host", label: "Pleiades" })).toBe(
      "server",
    );
    expect(
      defaultResourceIconId({ kind: "repository", label: "iurman/aviune" }),
    ).toBe("github");
    expect(
      defaultResourceIconId({ kind: "provider", label: "Cloudflare" }),
    ).toBe("cloudflare");
    expect(
      defaultResourceIconId({ kind: "host", label: "homeassistant" }),
    ).toBe("homeassistant");
    expect(
      defaultResourceIconId({ kind: "service", label: "Minecraft survival" }),
    ).toBe("minecraft");
    expect(defaultResourceIconId({ kind: "service", label: "postgres" })).toBe(
      "postgresql",
    );
    // Partial words are not technologies; groups keep their own glyphs.
    expect(defaultResourceIconId({ kind: "host", label: "Archive" })).toBe(
      "server",
    );
    expect(
      defaultResourceIconId({ kind: "collection", label: "Docker hosts" }),
    ).toBe("collection");
    expect(defaultResourceIconId({ kind: "unknown", label: "x" })).toBe(
      "collection",
    );
  });

  it("lets a known owner choice win and ignores an unknown one", () => {
    const host = { kind: "host", label: "Pleiades" };
    expect(resolveResourceIcon(host, "proxmox").id).toBe("proxmox");
    expect(resolveResourceIcon(host, "not-an-icon").id).toBe("server");
    expect(resolveResourceIcon(host).id).toBe("server");
  });

  it("shows a host's reported operating system before name hints, with Proxmox VE first", () => {
    const debian = { osId: "debian", osIdLike: [], platform: null };
    expect(platformIconId(debian)).toBe("debian");
    expect(platformIconId({ ...debian, platform: "proxmox-ve" })).toBe(
      "proxmox",
    );
    expect(
      platformIconId({
        osId: "pop",
        osIdLike: ["ubuntu", "debian"],
        platform: null,
      }),
    ).toBe("popos");
    // A derivative without its own logo uses its closest declared family.
    expect(
      platformIconId({ osId: "kali", osIdLike: ["debian"], platform: null }),
    ).toBe("debian");
    expect(
      platformIconId({
        osId: "rocky",
        osIdLike: ["rhel", "centos", "fedora"],
        platform: null,
      }),
    ).toBe("centos");
    expect(
      platformIconId({ osId: "nixos", osIdLike: [], platform: null }),
    ).toBe("linux");
    // Inherited object keys are not distributions.
    expect(
      platformIconId({
        osId: "constructor",
        osIdLike: ["toString"],
        platform: null,
      }),
    ).toBe("linux");
    for (const id of [
      "debian",
      "ubuntu",
      "fedora",
      "proxmox",
      "linux",
      "raspberrypi",
      "homeassistant",
    ])
      expect(resourceIcon(id)).toBeDefined();
    // The reported OS beats a hint in the host's own name.
    expect(
      defaultResourceIconId({
        kind: "host",
        label: "docker-01",
        platform: { ...debian, platform: "proxmox-ve" },
      }),
    ).toBe("proxmox");
    // Platform observations only choose a host's icon.
    expect(
      defaultResourceIconId({
        kind: "service",
        label: "postgres",
        platform: debian,
      }),
    ).toBe("postgresql");
    expect(
      defaultResourceIconId({
        kind: "host",
        label: "Pleiades",
        platform: undefined,
      }),
    ).toBe("server");
    // An explicit owner choice still wins over the reported OS.
    expect(
      resolveResourceIcon(
        { kind: "host", label: "Pleiades", platform: debian },
        "plex",
      ).id,
    ).toBe("plex");
    expect(
      resolveResourceIcon({ kind: "host", label: "Pleiades", platform: debian })
        .id,
    ).toBe("debian");
  });

  it("vendors unique, drawable icons and only shows legible brand colours", () => {
    const ids = resourceIcons.map((icon) => icon.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const icon of resourceIcons) {
      expect(icon.path).toMatch(/^[Mm]/);
      expect(resourceIcon(icon.id)).toBe(icon);
    }
    expect(brandIcons.map((icon) => icon.id)).toEqual(
      expect.arrayContaining(["github", "cloudflare", "proxmox", "debian"]),
    );
    const github = resourceIcon("github")!,
      cloudflare = resourceIcon("cloudflare")!;
    // GitHub's near-black would vanish at night; it falls back to the text colour.
    expect(legibleBrandColor(github, "midnight")).toBeUndefined();
    expect(legibleBrandColor(github, "porcelain")).toBe(github.hex);
    expect(legibleBrandColor(cloudflare, "midnight")).toBe(cloudflare.hex);
    expect(legibleBrandColor(resourceIcon("server")!, "midnight")).toBe(
      undefined,
    );
  });
});
