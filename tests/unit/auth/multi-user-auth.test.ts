import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createInvite } from "@/app/api/admin/invites/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as session } from "@/app/api/auth/session/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { closeDatabase, getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";

const baseUrl = "http://localhost";

let tempDir: string | null = null;
let databasePath = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "phd-multi-auth-"));
  databasePath = join(tempDir, "workspace.sqlite");
  vi.stubEnv("DATABASE_PATH", databasePath);
  vi.stubEnv("SESSION_SECRET", "session-secret");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
  vi.stubEnv("ADMIN_PASSWORD", "admin-password");
  ensureDatabaseSchema(getDatabase());
});

afterEach(async () => {
  vi.unstubAllEnvs();
  closeDatabase();

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("multi-user auth routes", () => {
  it("logs in the initialized admin user and returns their session identity", async () => {
    const loginResponse = await login(jsonRequest(`${baseUrl}/api/auth/login`, {
      email: "admin@example.com",
      password: "admin-password"
    }));

    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toEqual({
      authenticated: true,
      user: {
        email: "admin@example.com",
        role: "admin"
      }
    });

    const cookie = getSessionCookie(loginResponse);
    const sessionResponse = await session(new Request(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } }));

    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toEqual({
      authenticated: true,
      user: {
        email: "admin@example.com",
        role: "admin"
      }
    });
  });

  it("registers a user with a one-time invite code", async () => {
    const adminCookie = await loginAndGetCookie("admin@example.com", "admin-password");
    const inviteResponse = await createInvite(
      new Request(`${baseUrl}/api/admin/invites`, {
        method: "POST",
        headers: {
          Cookie: adminCookie
        }
      })
    );

    expect(inviteResponse.status).toBe(201);
    const { invite } = (await inviteResponse.json()) as { invite: { code: string } };

    const registerResponse = await register(jsonRequest(`${baseUrl}/api/auth/register`, {
      email: "student@example.com",
      password: "student-password",
      inviteCode: invite.code
    }));

    expect(registerResponse.status).toBe(201);
    await expect(registerResponse.json()).resolves.toEqual({
      authenticated: true,
      user: {
        email: "student@example.com",
        role: "user"
      }
    });
    expect(registerResponse.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);

    const reusedInviteResponse = await register(jsonRequest(`${baseUrl}/api/auth/register`, {
      email: "other@example.com",
      password: "student-password",
      inviteCode: invite.code
    }));

    expect(reusedInviteResponse.status).toBe(400);
    await expect(reusedInviteResponse.json()).resolves.toEqual({
      authenticated: false,
      error: "Invalid invite code"
    });
  });

  it("redirects to the login page when logging out from a browser form", async () => {
    const cookie = await loginAndGetCookie("admin@example.com", "admin-password");

    const response = await logout(
      new Request(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Accept: "text/html"
        }
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns a specific registration error when the password is too short", async () => {
    const adminCookie = await loginAndGetCookie("admin@example.com", "admin-password");
    const inviteResponse = await createInvite(
      new Request(`${baseUrl}/api/admin/invites`, {
        method: "POST",
        headers: {
          Cookie: adminCookie
        }
      })
    );
    const { invite } = (await inviteResponse.json()) as { invite: { code: string } };

    const response = await register(jsonRequest(`${baseUrl}/api/auth/register`, {
      email: "student@example.com",
      password: "short",
      inviteCode: invite.code
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      error: "Password must be at least 8 characters"
    });
  });
});

async function loginAndGetCookie(email: string, password: string): Promise<string> {
  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { email, password }));
  expect(response.status).toBe(200);
  return getSessionCookie(response);
}

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
    throw new Error("Expected response to set a cookie");
  }

  return setCookie.split(";")[0];
}
