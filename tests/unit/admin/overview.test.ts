import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as overview } from "@/app/api/admin/overview/route";
import { POST as createInvite } from "@/app/api/admin/invites/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { closeDatabase, getDatabase } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";

const baseUrl = "http://localhost";

let tempDir: string | null = null;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "phd-admin-overview-"));
  vi.stubEnv("DATABASE_PATH", join(tempDir, "workspace.sqlite"));
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

describe("admin overview route", () => {
  it("returns invite state, users, and aggregate usage stats for admins", async () => {
    const adminCookie = await loginAndGetCookie("admin@example.com", "admin-password");
    const firstInvite = await createInviteCode(adminCookie);
    const secondInvite = await createInviteCode(adminCookie);

    await register(jsonRequest(`${baseUrl}/api/auth/register`, {
      email: "student@example.com",
      password: "student-password",
      inviteCode: firstInvite.code
    }));

    const studentCookie = await loginAndGetCookie("student@example.com", "student-password");
    const studentUserId = getUserIdByEmail("student@example.com");
    const repositories = createSqliteRepositories(getDatabase(), studentUserId);
    await repositories.tasks.create({
      title: "Read paper",
      description: "",
      status: "not_started",
      priority: "low",
      dueDate: null,
      parentTaskId: null
    });
    await repositories.habits.create({ name: "Drink water", description: "", icon: "", targetCount: 3 });

    const forbidden = await overview(new Request(`${baseUrl}/api/admin/overview`, { headers: { Cookie: studentCookie } }));
    expect(forbidden.status).toBe(403);

    const response = await overview(new Request(`${baseUrl}/api/admin/overview`, { headers: { Cookie: adminCookie } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stats: {
        users: 2,
        invites: 2,
        usedInvites: 1,
        unusedInvites: 1,
        tasks: 1,
        habits: 1
      },
      invites: [
        { code: secondInvite.code, status: "unused", consumedByEmail: null },
        { code: firstInvite.code, status: "used", consumedByEmail: "student@example.com" }
      ],
      users: [
        { email: "admin@example.com", role: "admin", tasksCount: 0, habitsCount: 0 },
        { email: "student@example.com", role: "user", tasksCount: 1, habitsCount: 1 }
      ]
    });
  });
});

async function createInviteCode(adminCookie: string): Promise<{ code: string }> {
  const response = await createInvite(new Request(`${baseUrl}/api/admin/invites`, { method: "POST", headers: { Cookie: adminCookie } }));
  expect(response.status).toBe(201);
  const { invite } = (await response.json()) as { invite: { code: string } };
  return invite;
}

async function loginAndGetCookie(email: string, password: string): Promise<string> {
  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { email, password }));
  expect(response.status).toBe(200);
  return getSessionCookie(response);
}

function getUserIdByEmail(email: string): string {
  const row = getDatabase().prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string };
  return row.id;
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
