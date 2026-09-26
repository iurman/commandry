import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const rules = {
  domain: [],
  contracts: ["domain"],
  application: ["domain", "contracts"],
  db: ["domain", "application", "contracts"],
  integrations: ["domain", "application", "contracts"],
  platform: ["domain", "application", "contracts", "db"],
  config: [],
  ui: ["contracts", "experience"],
  experience: ["contracts"],
  "test-support": [
    "domain",
    "application",
    "contracts",
    "db",
    "platform",
    "config",
    "ui",
    "experience",
  ],
  web: [
    "domain",
    "application",
    "contracts",
    "db",
    "platform",
    "config",
    "ui",
    "experience",
  ],
  worker: [
    "domain",
    "application",
    "contracts",
    "db",
    "platform",
    "config",
    "experience",
  ],
  lab: [
    "domain",
    "application",
    "contracts",
    "config",
    "ui",
    "experience",
    "test-support",
  ],
};

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    if (
      [
        "node_modules",
        ".next",
        "dist",
        "storybook-static",
        "coverage",
      ].includes(name)
    )
      return [];
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.[cm]?[jt]sx?$/.test(name) ? [full] : [];
  });
}

const errors = [];
for (const top of ["apps", "packages"]) {
  const topPath = path.join(root, top);
  if (!existsSync(topPath)) continue;
  for (const name of readdirSync(topPath)) {
    const packagePath = path.join(topPath, name);
    const manifestPath = path.join(packagePath, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    for (const file of walk(packagePath)) {
      const source = readFileSync(file, "utf8");
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const isDev =
        /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(file) || name === "lab";
      const check = (specifier) => {
        if (specifier.startsWith("@commandry/")) {
          const target = specifier.split("/")[1];
          if (target === name) return;
          if (target === "lab" && name !== "lab") {
            errors.push(
              `${path.relative(root, file)} imports the local-only lab`,
            );
          } else if (target === "test-support" && !isDev) {
            errors.push(
              `${path.relative(root, file)} imports test support in production source`,
            );
          } else if (
            !rules[name]?.includes(target) &&
            !(isDev && target === "test-support")
          ) {
            errors.push(
              `${path.relative(root, file)} crosses ${name} -> ${target} boundary`,
            );
          }
          if (!declared.has(`@commandry/${target}`)) {
            errors.push(
              `${path.relative(root, file)} imports undeclared @commandry/${target}`,
            );
          }
        } else if (specifier.startsWith(".")) {
          const resolved = path.resolve(path.dirname(file), specifier);
          const boundary = path.relative(packagePath, resolved);
          if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
            errors.push(
              `${path.relative(root, file)} crosses package boundary via relative import`,
            );
          }
        }
      };
      const visit = (node) => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          check(node.moduleSpecifier.text);
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          check(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Workspace dependency boundaries passed.");
