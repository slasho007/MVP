import { afterEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "./env.js";

const VALID_ENV = {
  APP_URL: "https://api.example.com",
  WEB_URL: "https://app.example.com",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  SHOPIFY_API_KEY: "key",
  SHOPIFY_API_SECRET: "secret",
  COOKIE_SECRET: "a".repeat(32),
};

describe("loadEnv", () => {
  afterEach(() => resetEnvCache());

  it("parses a valid environment with defaults", () => {
    const env = loadEnv(VALID_ENV as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.SHOPIFY_SCOPES).toBe("read_orders,read_products");
  });

  it("throws a readable error when required vars are missing", () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/Invalid environment configuration/);
  });

  it("rejects a short cookie secret", () => {
    expect(() =>
      loadEnv({ ...VALID_ENV, COOKIE_SECRET: "short" } as NodeJS.ProcessEnv),
    ).toThrow(/COOKIE_SECRET/);
  });
});
