import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  transpilePackages: [
    "@commandry/application",
    "@commandry/config",
    "@commandry/contracts",
    "@commandry/db",
    "@commandry/domain",
    "@commandry/experience",
    "@commandry/platform",
    "@commandry/ui",
  ],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
