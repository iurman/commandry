import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const errors = [];
const dockerfile = readFileSync("Dockerfile", "utf8");
const runtimeStage = dockerfile.split(/^FROM .* AS runtime\s*$/m)[1];
if (!runtimeStage) {
  errors.push(
    "Dockerfile needs a named final `runtime` stage for manifest inspection.",
  );
} else if (
  /^COPY .*?(apps\/lab|storybook|stories|test-support|fixtures)/im.test(
    runtimeStage,
  )
) {
  errors.push("Docker runtime stage copies lab, stories, or test fixtures.");
}

const labManifest = JSON.parse(readFileSync("apps/lab/package.json", "utf8"));
if (labManifest.private !== true || labManifest.scripts?.deploy) {
  errors.push("The Storybook lab must be private and have no deploy script.");
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    if (["node_modules", ".next", "dist", "storybook-static"].includes(name))
      return [];
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.[cm]?[jt]sx?$/.test(name) ? [full] : [];
  });
}

for (const directory of ["apps/web", "apps/worker", "packages"]) {
  for (const file of walk(directory)) {
    if (file.startsWith("packages/test-support")) continue;
    if (/@commandry\/lab|apps\/lab/.test(readFileSync(file, "utf8"))) {
      errors.push(`${file} imports the local-only lab.`);
    }
  }
}

for (const output of ["apps/web/.next/standalone", "apps/web/.next/static"]) {
  for (const file of walk(output)) {
    if (/apps\/lab|\.stories\.|test-support|fixtures/.test(file)) {
      errors.push(`${file} entered the production web output.`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Local experience lab boundaries passed.");
