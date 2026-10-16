import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { foundationDigest } from "@commandry/domain";
import { foundationCreateConfigurationSchema } from "@commandry/contracts";
import {
  buildFoundationSkillRegistryPreview,
  buildFoundationSkillRegistrationPlan,
  buildFoundationSkillRegistryIndex,
  compareFoundationSkillDrift,
  parseFoundationSkillBundle,
  readFoundationSkillConfigurationReceipt,
  type FoundationSkillDigest,
} from "./foundation-skill-registry";

// Bounded public representative snapshot: original seven IDs, statuses,
// harnesses and component declarations, with synthetic descriptions/content.
const manifest = {
  schema: "manifest.schema.json",
  library: "mnemosyne-skills",
  version: "0.1.0",
  generated_from_commit: "6bd1e9750c0e66b2e901b0877af895f1f4b03cf1",
  entries: [
    {
      id: "standing-rules",
      version: "0.1.0",
      path: "skills/standing-rules",
      description: "Representative public test fixture.",
      harnesses: ["claude_code", "codex", "cursor"],
      scope: "user",
      components: {
        skill: "skills/standing-rules",
        rules: ["rules/standing-rules.md"],
        hooks: {
          claude_code: "hooks/standing-rules.claude_code.json",
          codex: "hooks/standing-rules.codex.json",
          cursor: "hooks/standing-rules.cursor.json",
        },
        chat: "chat/standing-rules.md",
        git_hooks: ["skills/standing-rules/scripts/pre-push"],
      },
      status: "shipped",
    },
    {
      id: "verify-before-done",
      version: "0.1.0",
      path: "skills/verify-before-done",
      description: "Representative public test fixture.",
      harnesses: ["claude_code", "codex", "cursor"],
      scope: "user",
      components: {
        skill: "skills/verify-before-done",
        commands: ["commands/check.md"],
        rules: ["rules/verify-before-done.md"],
        chat: "chat/verify-before-done.md",
      },
      status: "not_shipped",
    },
    {
      id: "session-brief",
      version: "0.1.0",
      path: "skills/session-brief",
      description: "Representative public test fixture.",
      harnesses: ["claude_code", "codex", "cursor"],
      scope: "user",
      components: {
        skill: "skills/session-brief",
        commands: ["commands/brief.md"],
      },
      status: "shipped",
    },
    {
      id: "session-boundary",
      version: "0.1.0",
      path: "skills/session-boundary",
      description: "Representative public test fixture.",
      harnesses: ["claude_code", "codex", "cursor"],
      scope: "user",
      components: {
        skill: "skills/session-boundary",
        rules: ["rules/session-boundary.md"],
        hooks: {
          claude_code: "hooks/session-boundary.claude_code.json",
          codex: "hooks/session-boundary.codex.json",
          cursor: "hooks/session-boundary.cursor.json",
        },
        chat: "chat/session-boundary.md",
      },
      status: "draft",
    },
    {
      id: "handoff",
      version: "0.1.0",
      path: "skills/handoff",
      description: "Representative public test fixture.",
      harnesses: ["claude_code", "codex", "cursor"],
      scope: "user",
      components: {
        skill: "skills/handoff",
        commands: ["commands/handoff.md"],
      },
      status: "shipped",
    },
    {
      id: "plan-worker-review",
      version: "0.1.0",
      path: "skills/plan-worker-review",
      description: "Representative public test fixture.",
      harnesses: ["claude_code", "codex", "cursor"],
      scope: "user",
      components: {
        skill: "skills/plan-worker-review",
        commands: ["commands/plan.md", "commands/review.md"],
        agents: ["agents/loop-worker.md"],
        hooks: {
          claude_code: "hooks/plan-worker-review.claude_code.json",
          codex: "hooks/plan-worker-review.codex.json",
          cursor: "hooks/plan-worker-review.cursor.json",
        },
      },
      status: "shipped",
    },
    {
      id: "subagent-contract",
      version: "0.1.0",
      path: "skills/subagent-contract",
      description: "Representative public test fixture.",
      harnesses: ["claude_code", "cursor", "codex"],
      scope: "user",
      components: {
        skill: "skills/subagent-contract",
        agents: ["agents/worker.md"],
      },
      status: "shipped",
    },
  ],
};

const projectId = "00000000-0000-4000-8000-000000000001";
const id = (index: number) =>
  "00000000-0000-4000-8000-" + index.toString(16).padStart(12, "0");
const digest = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const content = "PRIVATE_SOURCE_MARKER\r\n  exact spacing \u2603 e\u0301\n";
function bundle() {
  const paths = new Set<string>();
  for (const entry of manifest.entries) {
    const c = entry.components as Record<string, unknown>;
    if (typeof c.skill === "string") paths.add(c.skill + "/SKILL.md");
    for (const field of ["rules", "commands", "agents", "git_hooks"])
      for (const file of (c[field] ?? []) as string[]) paths.add(file);
    for (const file of Object.values(c.hooks ?? {})) paths.add(file as string);
    if (typeof c.chat === "string") paths.add(c.chat);
  }
  return {
    schemaVersion: 1,
    projectId,
    sourceCommit: "a".repeat(40),
    manifestContent: JSON.stringify(manifest, null, 2) + "\r\n",
    selectedIds: manifest.entries.map((entry) => entry.id),
    files: [...paths].map((path) => ({
      path,
      content: content as string | null,
    })),
  };
}
function changeManifest(
  value: ReturnType<typeof bundle>,
  mutate: (source: typeof manifest) => void,
) {
  const source = structuredClone(manifest);
  mutate(source);
  value.manifestContent = JSON.stringify(source);
  return value;
}
function largeBundle(extraPathCharacters = 0, manifestLength?: number) {
  const source = bundle();
  const paths = Array.from(
    { length: 999 },
    (_, index) =>
      "commands/" +
      index.toString().padStart(3, "0") +
      "/" +
      "x".repeat(
        Math.floor(extraPathCharacters / 999) +
          (index < extraPathCharacters % 999 ? 1 : 0),
      ),
  );
  // Every path needs a nonempty final segment, even at the baseline size.
  const commands = paths.map((path) => path + "x");
  const entry = {
    ...manifest.entries[0]!,
    id: "large",
    path: "skills/large",
    description: "Public size-boundary fixture.",
    components: { commands },
  };
  const original = { ...manifest, entries: [entry] };
  source.manifestContent = JSON.stringify(original);
  if (manifestLength !== undefined) {
    entry.description += "x".repeat(
      manifestLength - source.manifestContent.length,
    );
    source.manifestContent = JSON.stringify(original);
  }
  source.selectedIds = [entry.id];
  source.files = commands.map((path) => ({ path, content: "x" }));
  return source;
}
function registrationReceipts(
  plan: ReturnType<typeof buildFoundationSkillRegistrationPlan>,
) {
  return [plan.manifest, ...plan.components].map((item, index) => ({
    step: item.step,
    id: id(index + 10),
    contentDigest: item.contentDigest,
    idempotencyKey: item.idempotencyKey,
  }));
}
const invalidMessage = "Invalid foundation skill registry input";
describe("closed source bundle inventory", () => {
  it("preserves all seven entries and actual statuses without promotion", () => {
    const source = bundle();
    const result = buildFoundationSkillRegistryPreview(source);
    expect(result.entries).toHaveLength(7);
    expect(
      result.entries.filter((entry) => entry.status === "shipped"),
    ).toHaveLength(5);
    expect(
      result.entries
        .filter((entry) => entry.status === "draft")
        .map((entry) => entry.id),
    ).toEqual(["session-boundary"]);
    expect(
      result.entries
        .filter((entry) => entry.status === "not_shipped")
        .map((entry) => entry.id),
    ).toEqual(["verify-before-done"]);
    expect(
      new Set(result.components.map((component) => component.role)),
    ).toEqual(
      new Set([
        "skill",
        "rule",
        "command",
        "agent",
        "git_hook",
        "hook",
        "chat",
      ]),
    );
    expect(
      new Set(
        result.components
          .filter((component) => component.role === "hook")
          .map((component) => component.harness),
      ),
    ).toEqual(new Set(["claude_code", "codex", "cursor"]));
    expect(
      result.entries.every(
        (entry) =>
          entry.scope === "user" &&
          entry.version === "0.1.0" &&
          entry.harnesses.length === 3,
      ),
    ).toBe(true);
    expect(result.sourceCommit).toBe(source.sourceCommit);
    expect(result.historicalGeneratedCommit).toBe(
      manifest.generated_from_commit,
    );
    expect(result.sourceCommit).not.toBe(result.historicalGeneratedCommit);
    expect(result).toMatchObject({
      registered: false,
      installed: "unknown",
      invoked: "unknown",
      enforced: "unknown",
      missingComponents: [],
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SOURCE_MARKER");
  });
  it("preserves declared repo scope in preview, source and index, and rejects project scope", () => {
    const source = changeManifest(bundle(), (m) => {
      m.entries[0]!.scope = "repo";
    });
    const original = source.manifestContent;
    const plan = buildFoundationSkillRegistrationPlan(source);
    expect(plan.preview.entries[0]!.scope).toBe("repo");
    expect(plan.manifest.input.content).toBe(original);
    const index = JSON.parse(
      buildFoundationSkillRegistryIndex(source, registrationReceipts(plan))
        .input.content,
    );
    expect(index.entries[0].scope).toBe("repo");
    expect(source.manifestContent).toBe(original);
    const unsupported = changeManifest(bundle(), (m) => {
      m.entries[0]!.scope = "project";
    });
    expect(() => parseFoundationSkillBundle(unsupported)).toThrow(
      invalidMessage,
    );
  });
  it("preserves CRLF, spacing, Unicode and original manifest bytes", () => {
    const source = bundle();
    const parsed = parseFoundationSkillBundle(JSON.stringify(source));
    expect(parsed).toEqual(source);
    const result = buildFoundationSkillRegistryPreview(parsed);
    expect(result.manifestDigest).toBe(digest(source.manifestContent));
    expect(result.bundleDigest).toBe(foundationDigest(source));
    expect(
      result.components.every(
        (component) => component.contentDigest === digest(content),
      ),
    ).toBe(true);
    expect(
      new Set(result.components.map((component) => component.identityDigest))
        .size,
    ).toBe(result.components.length);
    const rewritten = {
      ...source,
      manifestContent: source.manifestContent.replace(/\r\n/g, "\n"),
    };
    expect(
      buildFoundationSkillRegistryPreview(rewritten).manifestDigest,
    ).not.toBe(result.manifestDigest);
  });
  it("selects only declared components and reports explicit and omitted unavailable files", () => {
    const source = bundle();
    source.files[0]!.content = null;
    source.files.splice(1, 1);
    const preview = buildFoundationSkillRegistryPreview(source);
    expect(preview.missingComponents).toHaveLength(2);
    expect(
      preview.components
        .filter((component) => component.availability === "unavailable")
        .every((component) => component.contentDigest === null),
    ).toBe(true);
    expect(buildFoundationSkillRegistrationPlan(source).components.length).toBe(
      preview.components.length - 2,
    );
  });
  it("retains separate hook harness identities when a declared path is shared", () => {
    const source = changeManifest(bundle(), (m) => {
      const hooks = m.entries[0]!.components.hooks!;
      hooks.codex = hooks.claude_code;
    });
    source.files = source.files.filter(
      (file) => file.path !== "hooks/standing-rules.codex.json",
    );
    const matches = buildFoundationSkillRegistryPreview(
      source,
    ).components.filter(
      (c) => c.path === "hooks/standing-rules.claude_code.json",
    );
    expect(matches).toHaveLength(2);
    expect(new Set(matches.map((c) => c.identityDigest)).size).toBe(2);
  });
  it("rejects supplied unselected private files even if present in the manifest", () => {
    const source = bundle();
    source.selectedIds = ["standing-rules"];
    expect(() => parseFoundationSkillBundle(source)).toThrow(invalidMessage);
    const preview = buildFoundationSkillRegistryPreview(bundle());
    const selected = new Set(
      preview.components
        .filter((c) => c.entryId === "standing-rules")
        .map((c) => c.path),
    );
    source.files = source.files.filter((file) => selected.has(file.path));
    expect(
      buildFoundationSkillRegistryPreview(source).entries.map(
        (entry) => entry.id,
      ),
    ).toEqual(["standing-rules"]);
  });
  it.each([
    "../secret",
    "/secret",
    "a/../secret",
    "a/./secret",
    "a//secret",
    "a\\secret",
    "a/",
    "file:%2fsecret",
    "./file",
    "trailing\n",
  ])("rejects unsafe path %s", (unsafe) => {
    const source = changeManifest(bundle(), (m) => {
      m.entries[0]!.components.skill = unsafe;
    });
    expect(() => parseFoundationSkillBundle(source)).toThrow(invalidMessage);
  });
  it.each([
    (s: ReturnType<typeof bundle>) => {
      s.selectedIds.push(s.selectedIds[0]!);
    },
    (s: ReturnType<typeof bundle>) => {
      s.selectedIds.push("unknown");
    },
    (s: ReturnType<typeof bundle>) => {
      s.selectedIds[0] += "\n";
    },
    (s: ReturnType<typeof bundle>) => {
      s.files.push(s.files[0]!);
    },
    (s: ReturnType<typeof bundle>) => {
      s.files.push({ path: "private/unused", content: "secret" });
    },
    (s: ReturnType<typeof bundle>) => {
      s.sourceCommit = "A".repeat(40);
    },
    (s: ReturnType<typeof bundle>) => {
      Object.assign(s, { private: true });
    },
    (s: ReturnType<typeof bundle>) => {
      Object.assign(s.files[0]!, { encoding: "base64" });
    },
    (s: ReturnType<typeof bundle>) => {
      s.files[0]!.content = "x".repeat(1000001);
    },
    (s: ReturnType<typeof bundle>) => {
      s.manifestContent = "x".repeat(1000001);
    },
    (s: ReturnType<typeof bundle>) => {
      s.files.forEach((file) => {
        file.content = "x".repeat(900000);
      });
    },
    (s: ReturnType<typeof bundle>) => {
      s.projectId = "ABCDEF00-0000-4000-8000-000000000001";
    },
    (s: ReturnType<typeof bundle>) => {
      s.files[0]!.content = "\ud800";
    },
  ])(
    "rejects duplicate, unknown, noncanonical or oversized bundle data",
    (mutate) => {
      const source = bundle();
      mutate(source);
      expect(() => parseFoundationSkillBundle(source)).toThrow(invalidMessage);
    },
  );
  it.each([
    (m: typeof manifest) => {
      m.entries.push(m.entries[0]!);
    },
    (m: typeof manifest) => {
      Object.assign(m.entries[0]!, { scope: "global" });
    },
    (m: typeof manifest) => {
      Object.assign(m.entries[0]!, { status: "installed" });
    },
    (m: typeof manifest) => {
      m.entries[0]!.components.rules!.push(m.entries[0]!.components.rules![0]!);
    },
    (m: typeof manifest) => {
      Object.assign(m.entries[0]!.components.hooks!, {
        other: "hooks/private",
      });
    },
    (m: typeof manifest) => {
      Object.assign(m.entries[0]!.components, { executable: "private" });
    },
    (m: typeof manifest) => {
      m.entries = Array.from({ length: 101 }, (_, i) => ({
        ...m.entries[0]!,
        id: "entry-" + i,
      }));
    },
    (m: typeof manifest) => {
      m.entries[0]!.components.commands = Array.from(
        { length: 1000 },
        (_, i) => "commands/" + i,
      );
    },
  ])("rejects malformed manifest declarations", (mutate) => {
    expect(() =>
      parseFoundationSkillBundle(changeManifest(bundle(), mutate)),
    ).toThrow(invalidMessage);
  });
  it("rejects malformed JSON, duplicate JSON keys, cycles and accessors without invoking them", () => {
    for (const value of [
      "{",
      '{"schemaVersion":1,"schemaVersion":1}',
      NaN,
      undefined,
      new Date(),
      new Map(),
      Symbol("private"),
    ])
      expect(() => parseFoundationSkillBundle(value)).toThrow(invalidMessage);
    const source = bundle();
    source.manifestContent = source.manifestContent.replace(
      '"schema":',
      '"library":"duplicate","schema":',
    );
    expect(() => parseFoundationSkillBundle(source)).toThrow(invalidMessage);
    let invoked = false;
    const hostile = bundle();
    Object.defineProperty(hostile, "files", {
      get() {
        invoked = true;
        throw new Error("PRIVATE_ACCESSOR");
      },
      enumerable: true,
    });
    expect(() => parseFoundationSkillBundle(hostile)).toThrow(invalidMessage);
    expect(invoked).toBe(false);
    const cyclic = bundle();
    Object.assign(cyclic, { cycle: cyclic });
    expect(() => parseFoundationSkillBundle(cyclic)).toThrow(invalidMessage);
  });
});
it("rejects conflicting selections and malformed optional declaration metadata", () => {
  for (const extra of [
    { conflicts_with: ["session-brief"] },
    { detect: "not-json-object" },
    { priority: 101 },
    { evidence: [] },
    { prevents_failure_class: ["invalid value"] },
  ]) {
    const source = changeManifest(bundle(), (m) => {
      Object.assign(m.entries[0]!, extra);
    });
    expect(() => parseFoundationSkillBundle(source)).toThrow(invalidMessage);
  }
});
it("accepts 100 entries and 999 components with 1000 index parents, then rejects the next component", () => {
  const source = bundle();
  const entries = Array.from({ length: 100 }, (_, i) => ({
    ...manifest.entries[0]!,
    id: "entry-" + i,
    components: {
      commands: Array.from(
        { length: i === 0 ? 9 : 10 },
        (_, n) => "commands/entry-" + i + "/" + n,
      ),
    },
  }));
  source.manifestContent = JSON.stringify({ ...manifest, entries });
  source.selectedIds = entries.map((entry) => entry.id);
  source.files = entries.flatMap((entry) =>
    entry.components.commands.map((path) => ({ path, content: "x" })),
  );
  const plan = buildFoundationSkillRegistrationPlan(source);
  expect(plan.preview.entries).toHaveLength(100);
  expect(plan.components).toHaveLength(999);
  const receipts = [plan.manifest, ...plan.components].map((d, i) => ({
    step: d.step,
    id: id(i + 10),
    contentDigest: d.contentDigest,
    idempotencyKey: d.idempotencyKey,
  }));
  expect(
    buildFoundationSkillRegistryIndex(source, receipts).input.parentIds,
  ).toHaveLength(1000);
  entries[0]!.components.commands.push("commands/additional");
  source.manifestContent = JSON.stringify({ ...manifest, entries });
  expect(() => parseFoundationSkillBundle(source)).toThrow(invalidMessage);
});
describe("immutable configuration descriptors and index", () => {
  it("rejects the 895442-character manifest derived-index overflow before registration", () => {
    const source = largeBundle(870 * 999, 895442);
    expect(source.manifestContent.length).toBe(895442);
    expect(
      Buffer.byteLength(source.manifestContent) + source.files.length,
    ).toBe(896441);
    expect(parseFoundationSkillBundle(source)).toEqual(source);
    expect(buildFoundationSkillRegistryPreview(source).components).toHaveLength(
      999,
    );
    expect(() => buildFoundationSkillRegistrationPlan(source)).toThrow(
      invalidMessage,
    );
  });
  it("accepts an exactly one-million-character index and rejects the next character during planning", () => {
    const baseline = largeBundle();
    const basePlan = buildFoundationSkillRegistrationPlan(baseline);
    const baseIndex = buildFoundationSkillRegistryIndex(
      baseline,
      registrationReceipts(basePlan),
    );
    const extra = 1000000 - baseIndex.input.content.length;
    expect(extra).toBeGreaterThan(0);
    const source = largeBundle(extra);
    const plan = buildFoundationSkillRegistrationPlan(source);
    expect(plan.components).toHaveLength(999);
    const receipts = registrationReceipts(plan);
    const index = buildFoundationSkillRegistryIndex(source, receipts);
    expect(index.input.content).toHaveLength(1000000);
    expect(index.input.parentIds).toHaveLength(1000);
    expect(
      foundationCreateConfigurationSchema.safeParse(index.input).success,
    ).toBe(true);
    const tooLarge = largeBundle(extra + 1);
    expect(() => parseFoundationSkillBundle(tooLarge)).not.toThrow();
    expect(() => buildFoundationSkillRegistrationPlan(tooLarge)).toThrow(
      invalidMessage,
    );
    const changed = receipts.map((receipt, position) =>
      position === 1 ? { ...receipt, contentDigest: "f".repeat(64) } : receipt,
    );
    expect(() => buildFoundationSkillRegistryIndex(source, changed)).toThrow(
      invalidMessage,
    );
    expect(() =>
      buildFoundationSkillRegistryIndex(
        source,
        receipts.map((receipt) => ({ ...receipt, id: id(10) })),
      ),
    ).toThrow(invalidMessage);
  });
  it("uses exact contents, stable ASCII keys and manifest/component/index provenance", () => {
    const source = bundle();
    const plan = buildFoundationSkillRegistrationPlan(source);
    expect(buildFoundationSkillRegistrationPlan(source)).toEqual(plan);
    expect(plan.manifest.input.content).toBe(source.manifestContent);
    expect(plan.components.every((d) => d.input.content === content)).toBe(
      true,
    );
    expect(new Set(plan.components.map((d) => d.input.kind))).toEqual(
      new Set(["skill", "prompt", "hook", "settings"]),
    );
    const receipts = [plan.manifest, ...plan.components].map((d, i) => ({
      step: d.step,
      id: id(i + 10),
      contentDigest: d.contentDigest,
      idempotencyKey: d.idempotencyKey,
    }));
    const index = buildFoundationSkillRegistryIndex(source, receipts);
    expect(index.input.parentIds).toEqual(receipts.map((r) => r.id));
    expect(index.input.parentIds.length).toBeLessThanOrEqual(1000);
    const parsed = JSON.parse(index.input.content);
    expect(parsed.manifestConfigurationId).toBe(receipts[0]!.id);
    expect(
      parsed.components.every((c: { configurationId: string }) =>
        receipts.some((r) => r.id === c.configurationId),
      ),
    ).toBe(true);
    expect(parsed).toMatchObject({
      registered: true,
      registrationState: "complete",
      installed: "unknown",
      invoked: "unknown",
      enforced: "unknown",
    });
    expect(index.input.content).not.toContain("PRIVATE_SOURCE_MARKER");
    for (const d of [plan.manifest, ...plan.components, index])
      expect(d.idempotencyKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
    expect(
      new Set(
        [plan.manifest, ...plan.components, index].map((d) => d.idempotencyKey),
      ).size,
    ).toBe(receipts.length + 1);
    expect(() =>
      buildFoundationSkillRegistryIndex(source, receipts.slice(1)),
    ).toThrow(invalidMessage);
    expect(() =>
      buildFoundationSkillRegistryIndex(source, [...receipts, receipts[0]]),
    ).toThrow(invalidMessage);
  });
  it("records an honest partial index only after all available components succeed", () => {
    const source = bundle();
    source.files[0]!.content = null;
    const plan = buildFoundationSkillRegistrationPlan(source);
    const receipts = [plan.manifest, ...plan.components].map((d, i) => ({
      step: d.step,
      id: id(i + 10),
      contentDigest: d.contentDigest,
      idempotencyKey: d.idempotencyKey,
    }));
    const index = JSON.parse(
      buildFoundationSkillRegistryIndex(source, receipts).input.content,
    );
    expect(index.registrationState).toBe("partial");
    expect(index.components[0].configurationId).toBeNull();
    expect(index.components[0].availability).toBe("unavailable");
  });
  it("binds safe receipts to exact returned bytes, project, parents, kind and commit", () => {
    const descriptor = buildFoundationSkillRegistrationPlan(bundle()).manifest;
    const response = {
      record: {
        ...descriptor.input,
        id: id(10),
        schemaVersion: 1,
        contentDigest: descriptor.contentDigest,
        recordedAt: "2026-10-15T00:00:00.000Z",
        recordedBy: "synthetic-owner",
      },
      replayed: false,
      correlationId: id(11),
    };
    const safe = readFoundationSkillConfigurationReceipt(response, descriptor);
    expect(safe.id).toBe(id(10));
    expect(Object.keys(safe).sort()).toEqual([
      "contentDigest",
      "id",
      "idempotencyKey",
      "step",
    ]);
    for (const fields of [
      { content: "tampered" },
      { contentDigest: "f".repeat(64) },
      { projectId: id(2) },
      { parentIds: [id(3)] },
      { sourceCommit: "other" },
      { kind: "skill" },
    ])
      expect(() =>
        readFoundationSkillConfigurationReceipt(
          { ...response, record: { ...response.record, ...fields } },
          descriptor,
        ),
      ).toThrow(invalidMessage);
  });
});
describe("three-way drift without overwrites or execution claims", () => {
  const a = "a".repeat(64),
    b = "b".repeat(64),
    c = "c".repeat(64);
  function row(path: string, digest: string | null): FoundationSkillDigest {
    return { role: "skill", path, harness: null, digest };
  }
  it("distinguishes every state, upstream removals, convergence and local-only additions", () => {
    const cases = [
      ["sync", a, a, a, "in_sync"],
      ["upstream", b, a, a, "upstream_changed"],
      ["local", a, a, b, "locally_modified"],
      ["diverged", b, a, c, "diverged"],
      ["missing", a, a, null, "missing"],
      ["not-installed", a, null, null, "not_installed"],
      ["unknown", a, undefined, a, "unknown_baseline"],
      ["local-only", undefined, undefined, a, "unknown_baseline"],
      ["removed-upstream", undefined, a, a, "upstream_changed"],
      ["converged", b, a, b, "in_sync"],
    ] as const;
    const input = {
      projectId,
      library: cases.flatMap(([path, digest]) =>
        digest === undefined ? [] : [row(path, digest)],
      ),
      baseline: cases.flatMap(([path, , digest]) =>
        digest === undefined ? [] : [row(path, digest)],
      ),
      observed: cases.flatMap(([path, , , digest]) =>
        digest === undefined ? [] : [row(path, digest)],
      ),
    };
    const before = structuredClone(input);
    const result = compareFoundationSkillDrift(input);
    expect(result.components).toHaveLength(cases.length);
    for (const [path, , baseline, , status] of cases) {
      expect(result.components.find((r) => r.path === path)).toMatchObject({
        status,
        baselineState:
          baseline === undefined
            ? "unknown"
            : baseline === null
              ? "not_installed"
              : "known",
      });
    }
    expect(
      result.components.find((r) => r.path === "local-only")!.localOnly,
    ).toBe(true);
    expect(result).toMatchObject({
      installed: "unknown",
      invoked: "unknown",
      enforced: "unknown",
    });
    expect(input).toEqual(before);
  });
  it("validates identities and hashes before comparison", () => {
    const input = {
      projectId,
      library: [row("skill", a)],
      baseline: [],
      observed: [],
    };
    for (const r of [
      { ...row("skill", a), digest: "A".repeat(64) },
      { ...row("../secret", a) },
      { ...row("skill", a), harness: "codex" },
      { ...row("skill", a), role: "unknown" },
    ])
      expect(() =>
        compareFoundationSkillDrift({ ...input, library: [r] }),
      ).toThrow(invalidMessage);
    expect(() =>
      compareFoundationSkillDrift({
        ...input,
        library: [row("skill", a), row("skill", a)],
      }),
    ).toThrow(invalidMessage);
    expect(() =>
      compareFoundationSkillDrift({ ...input, projectId: "bad" }),
    ).toThrow(invalidMessage);
  });
});
