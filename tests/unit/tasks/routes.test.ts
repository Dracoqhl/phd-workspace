import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { DELETE as deleteTask, GET as getTask, PATCH as updateTask } from "@/app/api/tasks/[id]/route";
import { POST as createSubtask } from "@/app/api/tasks/[id]/subtasks/route";
import { GET as listTasks, POST as createTask } from "@/app/api/tasks/route";
import { createRepositories } from "@/lib/data/repositories";
import type { Task } from "@/types/task";

const appPassword = "correct-password";
const sessionSecret = "session-secret";
const baseUrl = "http://localhost";

let tempDir: string | null = null;
let cookieHeader = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "phd-task-routes-"));
  vi.stubEnv("APP_PASSWORD", appPassword);
  vi.stubEnv("SESSION_SECRET", sessionSecret);
  vi.stubEnv("DATA_DIR", tempDir);
  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { password: appPassword }));
  cookieHeader = getSessionCookie(response);
});

afterEach(async () => {
  vi.unstubAllEnvs();

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("task routes", () => {
  it("rejects unauthenticated task requests", async () => {
    const response = await listTasks(new Request(`${baseUrl}/api/tasks`));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("creates and lists top-level tasks", async () => {
    const created = await createTaskJson({ title: "Read paper", priority: "high", dueDate: "2026-05-20" });

    expect(created).toMatchObject({
      title: "Read paper",
      description: "",
      status: "not_started",
      priority: "high",
      dueDate: "2026-05-20",
      parentTaskId: null
    });

    const response = await listTasks(authRequest(`${baseUrl}/api/tasks`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tasks: [created] });
  });

  it("gets, updates, and deletes a task", async () => {
    const task = await createTaskJson({ title: "Draft intro" });

    const getResponse = await getTask(authRequest(`${baseUrl}/api/tasks/${task.id}`), { params: { id: task.id } });
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({ task });

    const patchResponse = await updateTask(
      authRequest(`${baseUrl}/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "blocked", priority: "medium" })
      }),
      { params: { id: task.id } }
    );
    const patched = (await patchResponse.json()) as { task: { status: string; completedAt: string | null } };
    expect(patchResponse.status).toBe(200);
    expect(patched.task.status).toBe("blocked");
    expect(patched.task.completedAt).toBeNull();

    const deleteResponse = await deleteTask(authRequest(`${baseUrl}/api/tasks/${task.id}`, { method: "DELETE" }), {
      params: { id: task.id }
    });
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ deleted: true });

    const missingResponse = await getTask(authRequest(`${baseUrl}/api/tasks/${task.id}`), { params: { id: task.id } });
    expect(missingResponse.status).toBe(404);
  });

  it("creates a subtask through the parent route", async () => {
    const parent = await createTaskJson({ title: "Paper" });

    const response = await createSubtask(
      authRequest(`${baseUrl}/api/tasks/${parent.id}/subtasks`, {
        method: "POST",
        body: JSON.stringify({ title: "Outline", priority: "low" })
      }),
      { params: { id: parent.id } }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      task: {
        title: "Outline",
        parentTaskId: parent.id,
        priority: "low"
      }
    });
  });

  it("deletes a parent task and its subtasks into trash", async () => {
    const parent = await createTaskJson({ title: "Paper" });
    const subtaskResponse = await createSubtask(
      authRequest(`${baseUrl}/api/tasks/${parent.id}/subtasks`, {
        method: "POST",
        body: JSON.stringify({ title: "Outline" })
      }),
      { params: { id: parent.id } }
    );
    const { task: child } = (await subtaskResponse.json()) as { task: Task };

    const response = await deleteTask(authRequest(`${baseUrl}/api/tasks/${parent.id}`, { method: "DELETE" }), {
      params: { id: parent.id }
    });

    expect(response.status).toBe(200);
    const repos = createRepositories(tempDir!);
    await expect(repos.tasks.list()).resolves.toEqual([]);
    await expect(repos.trash.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ originalId: parent.id }),
        expect.objectContaining({ originalId: child.id })
      ])
    );
  });

  it("rejects invalid task payloads", async () => {
    const response = await createTask(
      authRequest(`${baseUrl}/api/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: "", priority: "urgent" })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid task payload" });
  });

  it("returns a safe configuration error when DATA_DIR is missing", async () => {
    vi.stubEnv("DATA_DIR", "");

    const response = await listTasks(authRequest(`${baseUrl}/api/tasks`));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Data directory is not configured" });
  });
});

async function createTaskJson(overrides: Record<string, unknown>): Promise<Task> {
  const response = await createTask(
    authRequest(`${baseUrl}/api/tasks`, {
      method: "POST",
      body: JSON.stringify(overrides)
    })
  );

  expect(response.status).toBe(201);
  return ((await response.json()) as { task: Task }).task;
}

function authRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      Cookie: cookieHeader,
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
    throw new Error("Expected login response to set a cookie");
  }

  return setCookie.split(";")[0];
}
