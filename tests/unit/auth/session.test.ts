import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  getSessionSecret,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken
} from "@/lib/auth/session";

const fixedNow = 1_778_167_498;
const sessionSecret = "session-secret";

describe("session auth", () => {
  it("exports the session cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("phd_workspace_session");
  });

  it("returns a configured SESSION_SECRET", () => {
    expect(getSessionSecret(sessionSecret)).toBe(sessionSecret);
  });

  it("throws a clear error when SESSION_SECRET is missing", () => {
    expect(() => getSessionSecret("")).toThrow("SESSION_SECRET is not configured");
  });

  it("throws a clear error when SESSION_SECRET is whitespace only", () => {
    expect(() => getSessionSecret("   ")).toThrow("SESSION_SECRET is not configured");
  });

  it("throws a clear error when SESSION_SECRET is undefined", () => {
    expect(() => getSessionSecret(undefined)).toThrow("SESSION_SECRET is not configured");
  });

  it("creates a token that verifies with the same session secret", () => {
    const token = createSessionToken(sessionSecret, fixedNow);

    expect(verifySessionToken(token, sessionSecret, fixedNow)).toBe(true);
  });

  it("rejects a token with the wrong session secret", () => {
    const token = createSessionToken(sessionSecret, fixedNow);

    expect(verifySessionToken(token, "changed", fixedNow)).toBe(false);
  });

  it("accepts a token one second before expiration", () => {
    const token = createSessionToken(sessionSecret, fixedNow);

    expect(verifySessionToken(token, sessionSecret, fixedNow + SESSION_MAX_AGE_SECONDS - 1)).toBe(
      true
    );
  });

  it("rejects a token at expiration", () => {
    const token = createSessionToken(sessionSecret, fixedNow);

    expect(verifySessionToken(token, sessionSecret, fixedNow + SESSION_MAX_AGE_SECONDS)).toBe(
      false
    );
  });

  it("rejects an expired token", () => {
    const token = createSessionToken(sessionSecret, fixedNow);

    expect(verifySessionToken(token, sessionSecret, fixedNow + SESSION_MAX_AGE_SECONDS + 1)).toBe(
      false
    );
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("not-a-token", sessionSecret, fixedNow)).toBe(false);
  });

  it("rejects tokens with extra dot-separated segments", () => {
    const token = createSessionToken(sessionSecret, fixedNow);

    expect(verifySessionToken(`${token}.extra`, sessionSecret, fixedNow)).toBe(false);
  });

  it("rejects tokens with an empty payload", () => {
    expect(verifySessionToken(".abc123", sessionSecret, fixedNow)).toBe(false);
  });

  it("rejects tokens with an empty signature", () => {
    expect(verifySessionToken(`${fixedNow + SESSION_MAX_AGE_SECONDS}.`, sessionSecret, fixedNow)).toBe(
      false
    );
  });

  it("rejects tokens with a non-integer expiry", () => {
    const token = createSessionToken(sessionSecret, fixedNow);
    const [, signature] = token.split(".");

    expect(verifySessionToken(`1778167498e0.${signature}`, sessionSecret, fixedNow)).toBe(false);
  });

  it("rejects tokens with an unsafe integer expiry", () => {
    const token = createSessionToken(sessionSecret, fixedNow);
    const [, signature] = token.split(".");

    expect(verifySessionToken(`${Number.MAX_SAFE_INTEGER + 1}.${signature}`, sessionSecret, fixedNow)).toBe(
      false
    );
  });

  it("rejects tokens with a wrong-length signature", () => {
    const token = createSessionToken(sessionSecret, fixedNow);
    const [expiresAtValue, signature] = token.split(".");

    expect(verifySessionToken(`${expiresAtValue}.${signature.slice(1)}`, sessionSecret, fixedNow)).toBe(
      false
    );
  });

  it("rejects tokens with a non-hex signature", () => {
    const token = createSessionToken(sessionSecret, fixedNow);
    const [expiresAtValue, signature] = token.split(".");

    expect(verifySessionToken(`${expiresAtValue}.${signature.slice(0, -1)}z`, sessionSecret, fixedNow)).toBe(
      false
    );
  });
});
