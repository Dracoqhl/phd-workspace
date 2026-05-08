import { afterEach, describe, expect, it, vi } from "vitest";

import { getConfiguredPassword, verifyPassword } from "@/lib/auth/password";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("password auth", () => {
  it("returns a configured APP_PASSWORD", () => {
    expect(getConfiguredPassword("secret")).toBe("secret");
  });

  it("throws a clear error when APP_PASSWORD is missing", () => {
    expect(() => getConfiguredPassword("")).toThrow("APP_PASSWORD is not configured");
  });

  it("throws a clear error when APP_PASSWORD is whitespace only", () => {
    expect(() => getConfiguredPassword("   ")).toThrow("APP_PASSWORD is not configured");
  });

  it("throws a clear error when APP_PASSWORD is undefined", () => {
    expect(() => getConfiguredPassword(undefined)).toThrow("APP_PASSWORD is not configured");
  });

  it("throws a clear error when the default APP_PASSWORD environment value is missing", () => {
    vi.stubEnv("APP_PASSWORD", undefined);

    expect(() => getConfiguredPassword()).toThrow("APP_PASSWORD is not configured");
  });

  it("accepts the correct password", () => {
    expect(verifyPassword("secret", "secret")).toBe(true);
  });

  it("rejects the wrong password", () => {
    expect(verifyPassword("wrong", "secret")).toBe(false);
  });
});
