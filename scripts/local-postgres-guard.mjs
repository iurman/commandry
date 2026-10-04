import { runContainer } from "./container-runtime.mjs";

// Never start a second database process against a mounted PostgreSQL cluster.
export function assertLocalPostgresAvailable(
  runtime,
  composeArgs,
  execute = runContainer,
) {
  function read(args) {
    const result = execute(runtime, args, {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      throw new Error(
        "Cannot verify local PostgreSQL volume ownership; startup was stopped.",
      );
    }
    return result.stdout.trim();
  }

  function parse(value) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(
        "Cannot parse local PostgreSQL volume ownership evidence.",
      );
    }
  }

  const config = parse(read([...composeArgs, "config", "--format", "json"]));
  const mount = config.services?.postgres?.volumes?.find(
    (entry) =>
      entry.type === "volume" && entry.target === "/var/lib/postgresql",
  );
  const volume = config.volumes?.[mount?.source]?.name;
  if (!config.name || !volume) {
    throw new Error("Cannot identify the local PostgreSQL project and volume.");
  }

  const ids = read([
    "ps",
    "--filter",
    `volume=${volume}`,
    "--format",
    "{{.ID}}",
  ])
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length === 0) return;
  const containers = read([
    "inspect",
    ...ids,
    "--format",
    '{"name":{{json .Name}},"labels":{{json .Config.Labels}},"mounts":{{json .Mounts}}}',
  ])
    .split("\n")
    .map(parse);
  const owners = containers.filter((container) =>
    container.mounts?.some(
      (entry) => entry.Type === "volume" && entry.Name === volume && entry.RW,
    ),
  );
  if (
    owners.length > 1 ||
    owners.some(
      (owner) =>
        owner.labels?.["com.docker.compose.project"] !== config.name ||
        owner.labels?.["com.docker.compose.service"] !== "postgres",
    )
  ) {
    throw new Error(
      `PostgreSQL volume ${volume} is already in use by ${owners.map((owner) => owner.name.replace(/^\//, "")).join(", ")}. Reuse its Compose project or choose a separate DB_VOLUME_NAME; startup was stopped.`,
    );
  }
}
