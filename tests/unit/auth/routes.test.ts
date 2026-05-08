import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as session } from "@/app/api/auth/session/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

const loginUrl = "http://localhost/api/auth/login";
const logoutUrl = "http://localhost/api/auth/logout";
const sessionUrl = "http://localhost/api/auth/session";
const appPassword = "correct-password";
const sessionSecret = "session-secret";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth routes", () => {
  it("POST login with the correct password authenticates and sets a session cookie", async () => {
    vi.stubEnv("APP_PASSWORD", appPassword);
    vi.stubEnv("SESSION_SECRET", sessionSecret);

    const response = await login(jsonRequest(loginUrl, { password: appPassword }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: true });
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
  });

  it("POST login from a native form redirects home and sets a session cookie", async () => {
    vi.stubEnv("APP_PASSWORD", appPassword);
    vi.stubEnv("SESSION_SECRET", sessionSecret);

    const response = await login(
      new Request(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ password: appPassword })
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
  });

  it("POST login with the wrong password rejects without setting a session cookie", async () => {
    vi.stubEnv("APP_PASSWORD", appPassword);
    vi.stubEnv("SESSION_SECRET", sessionSecret);

    const response = await login(jsonRequest(loginUrl, { password: "wrong-password" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      error: "Invalid password"
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("POST login with malformed JSON returns an invalid request error", async () => {
    vi.stubEnv("APP_PASSWORD", appPassword);
    vi.stubEnv("SESSION_SECRET", sessionSecret);

    const response = await login(
      new Request(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      error: "Invalid request"
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("POST logout clears the session cookie", async () => {
    const response = await logout(new Request(logoutUrl, { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/");
  });

  it("GET session reports authenticated when the request has a valid cookie from login", async () => {
    vi.stubEnv("APP_PASSWORD", appPassword);
    vi.stubEnv("SESSION_SECRET", sessionSecret);
    const loginResponse = await login(jsonRequest(loginUrl, { password: appPassword }));
    const cookieHeader = getSessionCookie(loginResponse);

    const response = await session(
      new Request(sessionUrl, {
        headers: {
          Cookie: cookieHeader
        }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({ authenticated: true });
  });

  it("GET session uses the last matching cookie when duplicate session cookies are present", async () => {
    vi.stubEnv("APP_PASSWORD", appPassword);
    vi.stubEnv("SESSION_SECRET", sessionSecret);
    const loginResponse = await login(jsonRequest(loginUrl, { password: appPassword }));
    const validSessionCookie = getSessionCookie(loginResponse);

    const response = await session(
      new Request(sessionUrl, {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=invalid; ${validSessionCookie}`
        }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({ authenticated: true });
  });

  it("POST login returns a safe configuration error when APP_PASSWORD is missing", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("SESSION_SECRET", sessionSecret);

    const response = await login(jsonRequest(loginUrl, { password: appPassword }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      error: "Auth is not configured"
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("POST login returns a safe configuration error when SESSION_SECRET is missing", async () => {
    vi.stubEnv("APP_PASSWORD", appPassword);
    vi.stubEnv("SESSION_SECRET", "");

    const response = await login(jsonRequest(loginUrl, { password: appPassword }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      error: "Auth is not configured"
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("GET session returns a safe configuration error when SESSION_SECRET is missing", async () => {
    vi.stubEnv("SESSION_SECRET", "");

    const response = await session(new Request(sessionUrl));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      error: "Auth is not configured"
    });
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function getSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected login response to set a cookie");
  }

  return setCookie.split(";")[0];
}
