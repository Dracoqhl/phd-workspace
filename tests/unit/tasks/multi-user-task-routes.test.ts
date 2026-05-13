import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createInvite } from "@/app/api/admin/invites/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as listTasks, POST as createTask } from "@/app/api/tasks/route";
import { closeDatabase, getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import type { Task } from "@/types/task";

const baseUrl = "http://localhost";

let tempDir: string | null = null;
let adminCookie = "";
let userCookie = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "phd-multi-tasks-"));
  vi.stubEnv("DATABASE_PATH", join(tempDir, "workspace.sqlite"));
  vi.stubEnv("SESSION_SECRET", "session-secret");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
  vi.stubEnv("ADMIN_PASSWORD", "admin-password");
  ensureDatabaseSchema(getDatabase());

  adminCookie = await loginAndGetCookie("admin@example.com", "admin-password");
  const invite = await createInviteCode(adminCookie);
  userCookie = await registerAndGetCookie("student@example.com", "student-password", invite);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  closeDatabase();

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("multi-user task routes", () => {
  it("isolates task lists and writes by authenticated user", async () => {
    const adminTask = await createTaskJson(adminCookie, { title: "Admin task" });
    const userTask = await createTaskJson(userCookie, { title: "Student task" });

    const adminListResponse = await listTasks(authRequest(adminCookie, `${baseUrl}/api/tasks`));
    await expect(adminListResponse.json()).resolves.toEqual({ tasks: [adminTask] });

    const userListResponse = await listTasks(authRequest(userCookie, `${baseUrl}/api/tasks`));
    await expect(userListResponse.json()).resolves.toEqual({ tasks: [userTask] });
  });
});

async function createInviteCode(cookie: string): Promise<string> {
  const response = await createInvite(
    new Request(`${baseUrl}/api/admin/invites`, {
      method: "POST",
      headers: { Cookie: cookie }
    })
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { invite: { code: string } }).invite.code;
}

async function registerAndGetCookie(email: string, password: string, inviteCode: string): Promise<string> {
  const response = await register(jsonRequest(`${baseUrl}/api/auth/register`, { email, password, inviteCode }));
  expect(response.status).toBe(201);
  return getSessionCookie(response);
}

async function loginAndGetCookie(email: string, password: string): Promise<string> {
  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { email, password }));
  expect(response.status).toBe(200);
  return getSessionCookie(response);
}

async function createTaskJson(cookie: string, overrides: Record<string, unknown>): Promise<Task> {
  const response = await createTask(
    authRequest(cookie, `${baseUrl}/api/tasks`, {
      method: "POST",
      body: JSON.stringify(overrides)
    })
  );

  expect(response.status).toBe(201);
  return ((await response.json()) as { task: Task }).task;
}

function authRequest(cookie: string, url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
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
