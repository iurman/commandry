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
    expect(config.localApprovalAutoCeiling).toBe("reversible");
    expect(config.localWorkAcceptanceRequired).toBe(true);
    expect(
      loadRuntimeConfig({
        ...valid,
        LOCAL_WORK_ACCEPTANCE_REQUIRED: "false",
      }).localWorkAcceptanceRequired,
    ).toBe(false);
    expect(() =>
      loadRuntimeConfig({
        ...valid,
        LOCAL_WORK_ACCEPTANCE_REQUIRED: "sometimes",
      }),
    ).toThrow(ConfigurationError);
    expect(config.localApprovalTtlSeconds).toBe(3_600);
    expect(config.localOvernightMaxDays).toBe(7);
  });

  it("bounds the provisional local overnight scheduling horizon", () => {
    expect(
      loadRuntimeConfig({ ...valid, LOCAL_OVERNIGHT_MAX_DAYS: "14" })
        .localOvernightMaxDays,
    ).toBe(14);
    expect(() =>
      loadRuntimeConfig({ ...valid, LOCAL_OVERNIGHT_MAX_DAYS: "91" }),
    ).toThrow(ConfigurationError);
  });

  it("keeps the local simulated approval threshold below sensitive actions", () => {
    const config = loadRuntimeConfig({
      ...valid,
      LOCAL_APPROVAL_AUTO_CEILING: "read_only",
      LOCAL_APPROVAL_TTL_SECONDS: "300",
    });
    expect(config.localApprovalAutoCeiling).toBe("read_only");
    expect(config.localApprovalTtlSeconds).toBe(300);
    expect(() =>
      loadRuntimeConfig({ ...valid, LOCAL_APPROVAL_AUTO_CEILING: "sensitive" }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadRuntimeConfig({ ...valid, LOCAL_APPROVAL_TTL_SECONDS: "59" }),
    ).toThrow(ConfigurationError);
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

  it("keeps preview and unconfigured production closed", () => {
    expect(() =>
      loadRuntimeConfig({ ...valid, APP_ENV: "production" }),
    ).toThrow(/PRODUCTION_AUTH_MODE/);
    expect(() => loadRuntimeConfig({ ...valid, APP_ENV: "preview" })).toThrow(
      /OQ-003/,
    );
  });

  it("requires an explicit bounded production password configuration", () => {
    const production = {
      ...valid,
      APP_ENV: "production",
      APP_ORIGIN: "https://commandry.site",
      DATABASE_URL: "postgresql://owner:password@postgres:5432/commandry",
      INITIAL_ADMIN_EMAIL: "owner@example.test",
      PRODUCTION_AUTH_MODE: "password",
    };
    const config = loadRuntimeConfig(production);
    expect(config.humanAuthMode).toBe("password");
    expect(config.productionAuthMode).toBe("password");
    for (const override of [
      { APP_ORIGIN: "http://commandry.site" },
      { APP_ORIGIN: "https://commandry.site:444" },
      { APP_ORIGIN: "https://commandry.site:443" },
      { APP_ORIGIN: "https://owner:password@commandry.site" },
      { APP_ORIGIN: "https://commandry.site/path" },
      { APP_ORIGIN: "https://127.0.0.1" },
      { DATABASE_URL: "postgresql://owner:password@db.example/commandry" },
      { INITIAL_ADMIN_EMAIL: "" },
      { LOCAL_AUTH_MODE: "password" },
      { LOCAL_AUTH_TRUSTED_ORIGIN: "http://10.0.0.73:3011" },
    ]) {
      expect(() => loadRuntimeConfig({ ...production, ...override })).toThrow(
        ConfigurationError,
      );
    }
    expect(() =>
      loadRuntimeConfig({ ...valid, PRODUCTION_AUTH_MODE: "password" }),
    ).toThrow(/only in production/);
  });

  it("requires loopback HTTP and a local PostgreSQL host for this scaffold", () => {
    expect(() =>
      loadRuntimeConfig({ ...valid, APP_ORIGIN: "https://commandry.example" }),
    ).toThrow(/loopback/);
    expect(() =>
      loadRuntimeConfig({ ...valid, APP_ORIGIN: "http://127.0.0.1:3000/path" }),
    ).toThrow(/loopback/);
    expect(() =>
      loadRuntimeConfig({
        ...valid,
        APP_ORIGIN: "http://user:pass@127.0.0.1:3000",
      }),
    ).toThrow(/loopback/);
    expect(() =>
      loadRuntimeConfig({
        ...valid,
        DATABASE_URL: "postgresql://user:pass@db.example/commandry",
      }),
    ).toThrow(/local PostgreSQL/);
  });

  it("keeps provisional password sign-in opt-in and bounded to one local owner", () => {
    expect(loadRuntimeConfig(valid).localAuthMode).toBe("off");
    expect(() =>
      loadRuntimeConfig({ ...valid, LOCAL_AUTH_MODE: "password" }),
    ).toThrow(/INITIAL_ADMIN_EMAIL/);
    const config = loadRuntimeConfig({
      ...valid,
      LOCAL_AUTH_MODE: "password",
      INITIAL_ADMIN_EMAIL: "owner@example.test",
      LOCAL_AUTH_TRUSTED_ORIGIN: "http://10.0.0.73:3011",
    });
    expect(config.localAuthMode).toBe("password");
    expect(config.localAuthTrustedOrigin).toBe("http://10.0.0.73:3011");
    for (const untrusted of [
      "https://10.0.0.73:3011",
      "http://public.example:3011",
      "http://user:pass@10.0.0.73:3011",
      "http://10.0.0.73:3011/path",
      "http://10.0.0.73:3011?query=1",
    ]) {
      expect(() =>
        loadRuntimeConfig({
          ...valid,
          LOCAL_AUTH_MODE: "password",
          INITIAL_ADMIN_EMAIL: "owner@example.test",
          LOCAL_AUTH_TRUSTED_ORIGIN: untrusted,
        }),
      ).toThrow(ConfigurationError);
    }
  });
});
