import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function digest(files) {
  const hash = createHash("sha256");
  for (const name of files.sort()) {
    hash.update(name + "\0");
    hash.update(readFileSync(resolve(root, name)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
function walk(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(
    (item) => {
      const name = `${directory}/${item.name}`;
      return item.isDirectory() ? walk(name) : [name];
    },
  );
}
const controls = readFileSync(
  resolve(root, "deploy/controls-files.txt"),
  "utf8",
)
  .trim()
  .split("\n");
const metadata = {
  version: 1,
  controls: digest([
    ...controls,
    "deploy/controls-files.txt",
    "scripts/release-policy.mjs",
    "Dockerfile",
    ".github/workflows/release-candidate.yml",
    ".github/actions/release-setup/action.yml",
    "scripts/ci-release.mjs",
  ]),
  migrations: digest(walk("packages/db/migrations")),
};
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(metadata) + "\n");
else console.log(JSON.stringify(metadata));
