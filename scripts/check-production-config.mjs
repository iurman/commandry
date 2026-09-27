import { existsSync } from "node:fs";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";

const envFile = process.argv[2] ?? "deploy/production.env.example";
const example = envFile === "deploy/production.env.example";
if (!existsSync(envFile)) {
  console.error("Production configuration file is unavailable.");
  process.exit(1);
}
const runtime = detectContainerRuntime();
if (!runtime) {
  console.error("A Docker-compatible Compose runtime is unavailable.");
  process.exit(1);
}
const result = runContainer(
  runtime,
  [
    "compose",
    "--env-file",
    envFile,
    "-f",
    "compose.production.yaml",
    "config",
    "--format",
    "json",
  ],
  { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
);
if (result.error || result.status !== 0) {
  console.error("Production Compose configuration is invalid.");
  process.exit(1);
}
let config;
try {
  config = JSON.parse(result.stdout);
} catch {
  console.error("Production Compose configuration did not return JSON.");
  process.exit(1);
}
const services = config.services ?? {};
const expectedServices = [
  "caddy",
  "cloudflared",
  "migrate",
  "postgres",
  "web",
  "worker",
];
const names = Object.keys(services).sort();
const appImage = services.web?.image;
const digestReference = /^\S+@sha256:[0-9a-f]{64}$/;
const errors = [];
if (JSON.stringify(names) !== JSON.stringify(expectedServices))
  errors.push("service topology");
if (
  !appImage ||
  services.worker?.image !== appImage ||
  services.migrate?.image !== appImage
)
  errors.push("release image parity");
for (const name of expectedServices) {
  const service = services[name];
  if (!service) continue;
  if (service.ports?.length || service.build) errors.push(`${name} exposure`);
}
for (const name of ["migrate", "web", "worker"]) {
  if (services[name]?.environment?.APP_ENV !== "production")
    errors.push(`${name} environment`);
}
if (services.web?.environment?.DATABASE_MIGRATION_URL)
  errors.push("web migration credential");
if (services.worker?.environment?.DATABASE_MIGRATION_URL)
  errors.push("worker migration credential");
if (!services.migrate?.environment?.DATABASE_MIGRATION_URL)
  errors.push("migrator credential");
if (!example) {
  for (const name of expectedServices) {
    const image = services[name]?.image;
    if (!digestReference.test(image ?? "")) errors.push(`${name} image digest`);
  }
  for (const name of ["migrate", "web", "worker"]) {
    const variables = services[name]?.environment ?? {};
    if (
      Object.values(variables).some(
        (value) =>
          typeof value === "string" &&
          (value.includes("REPLACE") || value.includes("<")),
      )
    )
      errors.push(`${name} placeholder value`);
  }
}
if (errors.length > 0) {
  console.error(`Production configuration rejected: ${errors.join(", ")}.`);
  process.exit(1);
}
console.log(
  example
    ? "Production Compose template shape passed. Example credentials and image references are invalid for deployment."
    : "Production Compose topology and immutable image references passed. Deployment gates remain separate.",
);
