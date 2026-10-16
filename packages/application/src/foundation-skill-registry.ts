import { createHash } from "node:crypto";
import {
  foundationActorSchema,
  foundationConfigurationSchema,
  foundationCreateConfigurationSchema,
  type FoundationCreateConfiguration,
} from "@commandry/contracts";
import { canonicalFoundationJson, foundationDigest } from "@commandry/domain";

export type FoundationSkillRole =
  "skill" | "rule" | "command" | "agent" | "git_hook" | "hook" | "chat";
export type FoundationSkillHarness = "claude_code" | "codex" | "cursor";
export type FoundationSkillStatus = "shipped" | "draft" | "not_shipped";
export type FoundationSkillIdentity = {
  role: FoundationSkillRole;
  path: string;
  harness: FoundationSkillHarness | null;
};
export type FoundationSkillBundle = {
  schemaVersion: 1;
  projectId: string;
  sourceCommit: string;
  manifestContent: string;
  selectedIds: string[];
  files: { path: string; content: string | null }[];
};
export type FoundationSkillEntry = {
  id: string;
  version: string;
  status: FoundationSkillStatus;
  scope: "user" | "repo";
  harnesses: FoundationSkillHarness[];
};
export type FoundationSkillComponent = FoundationSkillIdentity & {
  entryId: string;
  identityDigest: string;
  contentDigest: string | null;
  availability: "available" | "unavailable";
};
export type FoundationSkillRegistryPreview = {
  schemaVersion: 1;
  projectId: string;
  bundleDigest: string;
  manifestDigest: string;
  library: string;
  libraryVersion: string;
  sourceCommit: string;
  historicalGeneratedCommit: string;
  entries: FoundationSkillEntry[];
  components: FoundationSkillComponent[];
  missingComponents: FoundationSkillIdentity[];
  registered: false;
  installed: "unknown";
  invoked: "unknown";
  enforced: "unknown";
};
export type FoundationSkillConfigurationDescriptor = {
  step: string;
  idempotencyKey: string;
  contentDigest: string;
  input: FoundationCreateConfiguration;
};
export type FoundationSkillRegistrationPlan = {
  preview: FoundationSkillRegistryPreview;
  manifest: FoundationSkillConfigurationDescriptor;
  components: FoundationSkillConfigurationDescriptor[];
};
export type FoundationSkillReceipt = {
  step: string;
  id: string;
  contentDigest: string;
  idempotencyKey: string;
};
const roles: FoundationSkillRole[] = [
  "skill",
  "rule",
  "command",
  "agent",
  "git_hook",
  "hook",
  "chat",
];
const harnesses: FoundationSkillHarness[] = ["claude_code", "codex", "cursor"];
const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const keyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const maximumBytes = 8 * 1024 * 1024;
const textDigest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
function invalid(): never {
  throw new TypeError("Invalid foundation skill registry input");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    invalid();
}
function string(value: unknown, maximum = 1000000): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    Buffer.from(value, "utf8").toString("utf8") !== value
  )
    invalid();
  return value;
}
function key(value: unknown): string {
  const result = string(value, 100);
  if (!keyPattern.test(result) || result.trim() !== result) invalid();
  return result;
}
function version(value: unknown): string {
  const result = string(value, 100);
  if (!versionPattern.test(result) || result.trim() !== result) invalid();
  return result;
}
function path(value: unknown): string {
  const result = string(value, 1000);
  if (
    result.trim() !== result ||
    !/^[A-Za-z0-9_@-][A-Za-z0-9_@./-]*$/.test(result) ||
    result
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  )
    invalid();
  return result;
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  return value;
}
function unique<T>(values: T[]): T[] {
  if (new Set(values).size !== values.length) invalid();
  return values;
}
function project(value: unknown): string {
  const parsed = foundationActorSchema.shape.projectId.safeParse(value);
  if (!parsed.success || parsed.data !== value) invalid();
  return parsed.data;
}
function hash(value: unknown): string {
  const result = string(value, 64);
  if (!hashPattern.test(result)) invalid();
  return result;
}

// Reject duplicate object keys before JSON.parse can erase them. Original source
// strings remain untouched; this scanner does not interpret their contents.
function decodeJson(source: string): unknown {
  if (source.length > 24 * 1024 * 1024) invalid();
  let cursor = 0;
  const space = () => {
    while (/[\t\n\r ]/.test(source[cursor] ?? "x")) cursor++;
  };
  function quoted(): string {
    const start = cursor++;
    while (cursor < source.length) {
      const character = source[cursor++];
      if (character === "\\") cursor++;
      else if (character === '"')
        return JSON.parse(source.slice(start, cursor)) as string;
    }
    return invalid();
  }
  function value(depth: number): void {
    if (depth > 64) invalid();
    space();
    const current = source[cursor];
    if (current === '"') {
      quoted();
      return;
    }
    if (current === "{" || current === "[") {
      const closing = current === "{" ? "}" : "]";
      const names = new Set<string>();
      cursor++;
      space();
      if (source[cursor] === closing) {
        cursor++;
        return;
      }
      for (;;) {
        space();
        if (current === "{") {
          if (source[cursor] !== '"') invalid();
          const name = quoted();
          if (names.has(name)) invalid();
          names.add(name);
          space();
          if (source[cursor++] !== ":") invalid();
        }
        value(depth + 1);
        space();
        if (source[cursor] === closing) {
          cursor++;
          return;
        }
        if (source[cursor++] !== ",") invalid();
      }
    }
    const token =
      /^(?:null|true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
        source.slice(cursor),
      );
    if (!token) invalid();
    cursor += token[0].length;
  }
  value(0);
  space();
  if (cursor !== source.length) invalid();
  return JSON.parse(source);
}
function json(raw: unknown): unknown {
  return JSON.parse(
    canonicalFoundationJson(typeof raw === "string" ? decodeJson(raw) : raw),
  );
}

type Inventory = {
  library: string;
  libraryVersion: string;
  historicalGeneratedCommit: string;
  entries: FoundationSkillEntry[];
  components: (FoundationSkillIdentity & { entryId: string })[];
};
function inventory(bundle: FoundationSkillBundle): Inventory {
  const manifest = object(json(bundle.manifestContent));
  keys(manifest, [
    "schema",
    "library",
    "version",
    "generated_from_commit",
    "entries",
  ]);
  if (
    manifest.schema !== "manifest.schema.json" ||
    !commitPattern.test(string(manifest.generated_from_commit, 40))
  )
    invalid();
  const library = key(manifest.library);
  const libraryVersion = version(manifest.version);
  const entries: FoundationSkillEntry[] = [];
  const components: Inventory["components"] = [];
  const ids = new Set<string>();
  const componentKeys = new Set<string>();
  for (const raw of array(manifest.entries, 100)) {
    const entry = object(raw);
    keys(
      entry,
      [
        "id",
        "version",
        "path",
        "description",
        "harnesses",
        "scope",
        "components",
        "status",
      ],
      [
        "detect",
        "priority",
        "conflicts_with",
        "prevents_failure_class",
        "evidence",
      ],
    );
    const id = key(entry.id);
    if (ids.has(id)) invalid();
    ids.add(id);
    path(entry.path);
    string(entry.description);
    const declared = unique(
      array(entry.harnesses, harnesses.length).map((h) => {
        if (!harnesses.includes(h as FoundationSkillHarness)) invalid();
        return h as FoundationSkillHarness;
      }),
    );
    if (
      !declared.length ||
      !["user", "repo"].includes(entry.scope as string) ||
      !["shipped", "draft", "not_shipped"].includes(entry.status as string)
    )
      invalid();
    if (entry.detect !== undefined) object(entry.detect);
    if (
      entry.priority !== undefined &&
      (!Number.isSafeInteger(entry.priority) ||
        (entry.priority as number) < 0 ||
        (entry.priority as number) > 100)
    )
      invalid();
    if (entry.evidence !== undefined) string(entry.evidence);
    for (const field of ["conflicts_with", "prevents_failure_class"]) {
      if (entry[field] !== undefined)
        unique(
          array(entry[field], 100).map((value) => {
            const name = string(value, 100);
            if (
              !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(name) ||
              name.trim() !== name
            )
              invalid();
            return name;
          }),
        );
    }
    if (entry.conflicts_with !== undefined) {
      const conflicts = array(entry.conflicts_with, 100).map(key);
      if (
        bundle.selectedIds.includes(id) &&
        conflicts.some((conflict) => bundle.selectedIds.includes(conflict))
      )
        invalid();
    }
    const metadata: FoundationSkillEntry = {
      id,
      version: version(entry.version),
      status: entry.status as FoundationSkillStatus,
      scope: entry.scope as FoundationSkillEntry["scope"],
      harnesses: declared,
    };
    const declarations = object(entry.components);
    keys(
      declarations,
      [],
      ["skill", "rules", "commands", "agents", "git_hooks", "hooks", "chat"],
    );
    const expanded: Inventory["components"] = [];
    const add = (
      role: FoundationSkillRole,
      rawPath: unknown,
      harness: FoundationSkillHarness | null = null,
    ) => {
      const component = { role, path: path(rawPath), harness, entryId: id };
      expanded.push(component);
    };
    if (declarations.skill !== undefined)
      add("skill", path(declarations.skill) + "/SKILL.md");
    for (const [field, role] of [
      ["rules", "rule"],
      ["commands", "command"],
      ["agents", "agent"],
      ["git_hooks", "git_hook"],
    ] as const) {
      if (declarations[field] !== undefined)
        for (const filename of unique(
          array(declarations[field], 999).map(path),
        ))
          add(role, filename);
    }
    if (declarations.chat !== undefined) add("chat", declarations.chat);
    if (declarations.hooks !== undefined) {
      const hooks = object(declarations.hooks);
      keys(hooks, [], declared);
      for (const harness of declared)
        if (hooks[harness] !== undefined) add("hook", hooks[harness], harness);
    }
    if (expanded.length === 0) invalid();
    if (bundle.selectedIds.includes(id)) {
      entries.push(metadata);
      for (const component of expanded) {
        const identity = canonicalFoundationJson({
          role: component.role,
          path: component.path,
          harness: component.harness,
        });
        if (componentKeys.has(identity)) invalid();
        componentKeys.add(identity);
        components.push(component);
      }
    }
  }
  if (bundle.selectedIds.some((id) => !ids.has(id)) || components.length > 999)
    invalid();
  return {
    library,
    libraryVersion,
    historicalGeneratedCommit: manifest.generated_from_commit as string,
    entries,
    components,
  };
}

export function parseFoundationSkillBundle(
  raw: unknown,
): FoundationSkillBundle {
  try {
    const value = object(json(raw));
    keys(value, [
      "schemaVersion",
      "projectId",
      "sourceCommit",
      "manifestContent",
      "selectedIds",
      "files",
    ]);
    if (
      value.schemaVersion !== 1 ||
      !commitPattern.test(string(value.sourceCommit, 40))
    )
      invalid();
    const bundle: FoundationSkillBundle = {
      schemaVersion: 1,
      projectId: project(value.projectId),
      sourceCommit: value.sourceCommit as string,
      manifestContent: string(value.manifestContent),
      selectedIds: unique(array(value.selectedIds, 100).map(key)),
      files: array(value.files, 999).map((file) => {
        const entry = object(file);
        keys(entry, ["path", "content"]);
        return {
          path: path(entry.path),
          content: entry.content === null ? null : string(entry.content),
        };
      }),
    };
    if (!bundle.selectedIds.length) invalid();
    unique(bundle.files.map((file) => file.path));
    const expected = new Set(
      inventory(bundle).components.map((component) => component.path),
    );
    if (bundle.files.some((file) => !expected.has(file.path))) invalid();
    const bytes =
      Buffer.byteLength(bundle.manifestContent, "utf8") +
      bundle.files.reduce(
        (sum, file) => sum + Buffer.byteLength(file.content ?? "", "utf8"),
        0,
      );
    if (bytes > maximumBytes) invalid();
    return bundle;
  } catch {
    return invalid();
  }
}

export function buildFoundationSkillRegistryPreview(
  raw: unknown,
): FoundationSkillRegistryPreview {
  const bundle = parseFoundationSkillBundle(raw);
  const source = inventory(bundle);
  const files = new Map(bundle.files.map((file) => [file.path, file.content]));
  const components = source.components.map(
    (component): FoundationSkillComponent => {
      const content = files.get(component.path);
      return {
        ...component,
        identityDigest: foundationDigest({
          role: component.role,
          path: component.path,
          harness: component.harness,
        }),
        contentDigest: typeof content === "string" ? textDigest(content) : null,
        availability: typeof content === "string" ? "available" : "unavailable",
      };
    },
  );
  return {
    schemaVersion: 1,
    projectId: bundle.projectId,
    bundleDigest: foundationDigest(bundle),
    manifestDigest: textDigest(bundle.manifestContent),
    library: source.library,
    libraryVersion: source.libraryVersion,
    sourceCommit: bundle.sourceCommit,
    historicalGeneratedCommit: source.historicalGeneratedCommit,
    entries: source.entries,
    components,
    missingComponents: components
      .filter((component) => component.availability === "unavailable")
      .map(({ role, path, harness }) => ({ role, path, harness })),
    registered: false,
    installed: "unknown",
    invoked: "unknown",
    enforced: "unknown",
  };
}
function descriptor(
  preview: FoundationSkillRegistryPreview,
  step: string,
  kind: FoundationCreateConfiguration["kind"],
  content: string,
  parentIds: string[],
): FoundationSkillConfigurationDescriptor {
  const input = foundationCreateConfigurationSchema.safeParse({
    projectId: preview.projectId,
    kind,
    content,
    parentIds,
    sourceCommit: preview.sourceCommit,
  });
  if (!input.success) invalid();
  return {
    step,
    idempotencyKey:
      "skill-registry:v1:" + preview.bundleDigest + ":" + textDigest(step),
    contentDigest: textDigest(content),
    input: input.data,
  };
}
export function buildFoundationSkillRegistrationPlan(
  raw: unknown,
): FoundationSkillRegistrationPlan {
  const bundle = parseFoundationSkillBundle(raw);
  const preview = buildFoundationSkillRegistryPreview(bundle);
  const files = new Map(bundle.files.map((file) => [file.path, file.content]));
  const kinds: Record<
    FoundationSkillRole,
    FoundationCreateConfiguration["kind"]
  > = {
    skill: "skill",
    rule: "settings",
    command: "prompt",
    agent: "prompt",
    git_hook: "hook",
    hook: "hook",
    chat: "prompt",
  };
  const plan = {
    preview,
    manifest: descriptor(
      preview,
      "manifest",
      "settings",
      bundle.manifestContent,
      [],
    ),
    components: preview.components
      .filter((component) => component.availability === "available")
      .map((component) =>
        descriptor(
          preview,
          component.identityDigest,
          kinds[component.role],
          files.get(component.path)!,
          [],
        ),
      ),
  };
  // UUIDs have a fixed canonical serialized width. Reserve every receipt and
  // the exact derived metadata before any caller can start registration.
  registryIndex(
    plan,
    [plan.manifest, ...plan.components].map((item, index) => ({
      step: item.step,
      id:
        "00000000-0000-4000-8000-" + (index + 1).toString(16).padStart(12, "0"),
      contentDigest: item.contentDigest,
      idempotencyKey: item.idempotencyKey,
    })),
  );
  return plan;
}
export function readFoundationSkillConfigurationReceipt(
  raw: unknown,
  expected: FoundationSkillConfigurationDescriptor,
): FoundationSkillReceipt {
  try {
    const result = object(json(raw));
    keys(result, ["record", "replayed", "correlationId"]);
    if (typeof result.replayed !== "boolean") invalid();
    project(result.correlationId);
    const record = foundationConfigurationSchema.parse(result.record);
    if (
      record.projectId !== expected.input.projectId ||
      record.kind !== expected.input.kind ||
      record.content !== expected.input.content ||
      record.contentDigest !== expected.contentDigest ||
      record.sourceCommit !== expected.input.sourceCommit ||
      canonicalFoundationJson(record.parentIds) !==
        canonicalFoundationJson(expected.input.parentIds)
    )
      invalid();
    return {
      step: expected.step,
      id: project(record.id),
      contentDigest: record.contentDigest,
      idempotencyKey: expected.idempotencyKey,
    };
  } catch {
    return invalid();
  }
}
function registryIndex(
  plan: FoundationSkillRegistrationPlan,
  rawReceipts: unknown,
): FoundationSkillConfigurationDescriptor {
  try {
    const receipts = array(json(rawReceipts), 1000).map(
      (raw): FoundationSkillReceipt => {
        const r = object(raw);
        keys(r, ["step", "id", "contentDigest", "idempotencyKey"]);
        return {
          step: string(r.step, 64),
          id: project(r.id),
          contentDigest: hash(r.contentDigest),
          idempotencyKey: string(r.idempotencyKey, 200),
        };
      },
    );
    unique(receipts.map((r) => r.step));
    unique(receipts.map((r) => r.id));
    const expected = [plan.manifest, ...plan.components];
    if (receipts.length !== expected.length) invalid();
    for (const item of expected) {
      const receipt = receipts.find((r) => r.step === item.step);
      if (
        !receipt ||
        receipt.contentDigest !== item.contentDigest ||
        receipt.idempotencyKey !== item.idempotencyKey
      )
        invalid();
    }
    const manifest = receipts.find((r) => r.step === "manifest")!;
    const index = {
      ...plan.preview,
      registered: true,
      registrationState: plan.preview.missingComponents.length
        ? "partial"
        : "complete",
      manifestConfigurationId: manifest.id,
      components: plan.preview.components.map((component) => ({
        ...component,
        configurationId:
          receipts.find((r) => r.step === component.identityDigest)?.id ?? null,
      })),
      receipts,
    };
    return descriptor(
      plan.preview,
      "index",
      "settings",
      canonicalFoundationJson(index),
      receipts.map((r) => r.id),
    );
  } catch {
    return invalid();
  }
}

export function buildFoundationSkillRegistryIndex(
  raw: unknown,
  rawReceipts: unknown,
): FoundationSkillConfigurationDescriptor {
  return registryIndex(buildFoundationSkillRegistrationPlan(raw), rawReceipts);
}

export type FoundationSkillDigest = FoundationSkillIdentity & {
  digest: string | null;
};
export type FoundationSkillDriftInput = {
  projectId: string;
  library: FoundationSkillDigest[];
  baseline: FoundationSkillDigest[];
  observed: FoundationSkillDigest[];
};
export type FoundationSkillDriftStatus =
  | "in_sync"
  | "upstream_changed"
  | "locally_modified"
  | "diverged"
  | "missing"
  | "not_installed"
  | "unknown_baseline";
export type FoundationSkillDriftReport = {
  projectId: string;
  components: (FoundationSkillIdentity & {
    libraryDigest: string | null;
    baselineDigest: string | null;
    observedDigest: string | null;
    baselineState: "known" | "not_installed" | "unknown";
    localOnly: boolean;
    status: FoundationSkillDriftStatus;
  })[];
  installed: "unknown";
  invoked: "unknown";
  enforced: "unknown";
};
export function compareFoundationSkillDrift(
  raw: unknown,
): FoundationSkillDriftReport {
  try {
    const input = object(json(raw));
    keys(input, ["projectId", "library", "baseline", "observed"]);
    const maps = ["library", "baseline", "observed"].map((field) => {
      const rows = array(input[field], 999).map(
        (raw): FoundationSkillDigest => {
          const row = object(raw);
          keys(row, ["role", "path", "harness", "digest"]);
          if (
            !roles.includes(row.role as FoundationSkillRole) ||
            (row.harness !== null &&
              !harnesses.includes(row.harness as FoundationSkillHarness)) ||
            (row.role !== "hook" && row.harness !== null) ||
            (row.role === "hook" && row.harness === null)
          )
            invalid();
          return {
            role: row.role as FoundationSkillRole,
            path: path(row.path),
            harness: row.harness as FoundationSkillHarness | null,
            digest: row.digest === null ? null : hash(row.digest),
          };
        },
      );
      const identities = rows.map(({ role, path, harness }) =>
        canonicalFoundationJson({ role, path, harness }),
      );
      unique(identities);
      return new Map(rows.map((row, i) => [identities[i]!, row]));
    });
    const [library, baseline, observed] = maps as [
      Map<string, FoundationSkillDigest>,
      Map<string, FoundationSkillDigest>,
      Map<string, FoundationSkillDigest>,
    ];
    const identities = [
      ...new Set([...library.keys(), ...baseline.keys(), ...observed.keys()]),
    ].sort();
    return {
      projectId: project(input.projectId),
      installed: "unknown",
      invoked: "unknown",
      enforced: "unknown",
      components: identities.map((identity) => {
        const upstream = library.get(identity);
        const installed = baseline.get(identity);
        const current = observed.get(identity);
        const a = upstream?.digest ?? null;
        const b = installed?.digest ?? null;
        const c = current?.digest ?? null;
        let status: FoundationSkillDriftStatus;
        if (!installed) status = "unknown_baseline";
        else if (b === null)
          status = c === null ? "not_installed" : "locally_modified";
        else if (c === null) status = "missing";
        else if (a === c) status = "in_sync";
        else if (b === c) status = "upstream_changed";
        else if (a === b) status = "locally_modified";
        else status = "diverged";
        const { role, path, harness } = (upstream ?? installed ?? current)!;
        return {
          role,
          path,
          harness,
          libraryDigest: a,
          baselineDigest: b,
          observedDigest: c,
          baselineState: !installed
            ? "unknown"
            : b === null
              ? "not_installed"
              : "known",
          localOnly: !upstream,
          status,
        };
      }),
    };
  } catch {
    return invalid();
  }
}
