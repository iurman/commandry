import { build } from "esbuild";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const workspaceSources = {
  "@commandry/application": "packages/application/src/index.ts",
  "@commandry/config": "packages/config/src/index.ts",
  "@commandry/contracts": "packages/contracts/src/index.ts",
  "@commandry/db": "packages/db/src/index.ts",
  "@commandry/db/schema": "packages/db/src/schema.ts",
  "@commandry/domain": "packages/domain/src/index.ts",
  "@commandry/platform": "packages/platform/src/index.ts",
};

await build({
  entryPoints: ["src/index.ts", "src/migrate.ts"],
  outdir: "dist",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
  plugins: [
    {
      name: "workspace-source",
      setup(api) {
        api.onResolve({ filter: /^@commandry\// }, (args) => {
          const source = workspaceSources[args.path];
          if (!source)
            throw new Error(`No workspace build mapping for ${args.path}`);
          return { path: path.join(root, source) };
        });
      },
    },
  ],
});
