import { describe, expect, it } from "vitest";
import { ConfigurationError, loadRuntimeConfig } from "./index";

const valid = {
  APP_ENV: "local",
  APP_ORIGIN: "http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://local:local@127.0.0.1:5432/commandry",
  BETTER_AUTH_SECRET: "x".repeat(32),
  APP_ENCRYPTION_KEY: "y".repeat(32),
  RELEASE_SHA: "local",
};

describe("runtime configuration", () => {
  it("parses bounded pool sizes and local values", () => {
    const config = loadRuntimeConfig({ ...valid, DB_POOL_MAX: "3" });
    expect(config.dbPoolMax).toBe(3);
    expect(config.bossPoolMax).toBe(5);
  });

  it("does not leak a secret value in validation errors", () => {
    const secret = "unsafe-secret-value";
    expect(() =>
      loadRuntimeConfig({ ...valid, BETTER_AUTH_SECRET: secret }),
    ).toThrow(ConfigurationError);
    try {
      loadRuntimeConfig({ ...valid, BETTER_AUTH_SECRET: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("blocks public environments while sign-in and recovery remain undecided", () => {
    expect(() =>
      loadRuntimeConfig({ ...valid, APP_ENV: "production" }),
    ).toThrow(/OQ-003/);
    expect(() => loadRuntimeConfig({ ...valid, APP_ENV: "preview" })).toThrow(
      /OQ-003/,
    );
  });

  it("requires loopback HTTP and a local PostgreSQL host for this scaffold", () => {
    expect(() =>
      loadRuntimeConfig({ ...valid, APP_ORIGIN: "https://commandry.example" }),
    ).toThrow(/loopback/);
    expect(() =>
      loadRuntimeConfig({
        ...valid,
        DATABASE_URL: "postgresql://user:pass@db.example/commandry",
      }),
    ).toThrow(/local PostgreSQL/);
  });
});
