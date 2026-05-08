import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { DELETE as deleteCheckin } from "@/app/api/habits/[id]/checkins/[date]/route";
import { POST as createCheckin } from "@/app/api/habits/[id]/checkins/route";
import { PATCH as updateHabit } from "@/app/api/habits/[id]/route";
import { PATCH as deactivateHabit } from "@/app/api/habits/[id]/deactivate/route";
import { GET as listHabits, POST as createHabit } from "@/app/api/habits/route";
import { createRepositories } from "@/lib/data/repositories";
import type { Habit } from "@/types/habit";

const appPassword = "correct-password";
const sessionSecret = "session-secret";
const baseUrl = "http://localhost";

let tempDir: string | null = null;
let cookieHeader = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "phd-habit-routes-"));
  vi.stubEnv("APP_PASSWORD", appPassword);
  vi.stubEnv("SESSION_SECRET", sessionSecret);
  vi.stubEnv("DATA_DIR", tempDir);
  vi.setSystemTime(new Date(2026, 4, 8, 3, 0, 0));

  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { password: appPassword }));
  cookieHeader = getSessionCookie(response);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("habit routes", () => {
  it("rejects unauthenticated habit requests", async () => {
    const response = await listHabits(new Request(`${baseUrl}/api/habits`));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("creates and lists active habits with today's check-in state", async () => {
    const created = await createHabitJson({ name: "Walk", description: "Ten minutes", icon: "shoe" });

    expect(created).toMatchObject({
      name: "Walk",
      description: "Ten minutes",
      icon: "shoe",
      targetCount: 1,
      isActive: true
    });

    const response = await listHabits(authRequest(`${baseUrl}/api/habits`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      date: "2026-05-08",
      habits: [
        {
          habit: created,
          checkin: null,
          isCompleted: false
        }
      ]
    });
  });

  it("updates and deactivates a habit without deleting its history", async () => {
    const habit = await createHabitJson({ name: "Sleep", icon: "moon" });

    const updateResponse = await updateHabit(
      authRequest(`${baseUrl}/api/habits/${habit.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Sleep before 1", description: "No late scrolling", icon: "bed" })
      }),
      { params: { id: habit.id } }
    );
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      habit: { name: "Sleep before 1", description: "No late scrolling", icon: "bed", isActive: true }
    });

    const checkinResponse = await createCheckin(authRequest(`${baseUrl}/api/habits/${habit.id}/checkins`, { method: "POST" }), {
      params: { id: habit.id }
    });
    expect(checkinResponse.status).toBe(201);

    const deactivateResponse = await deactivateHabit(
      authRequest(`${baseUrl}/api/habits/${habit.id}/deactivate`, { method: "PATCH" }),
      { params: { id: habit.id } }
    );
    expect(deactivateResponse.status).toBe(200);

    const listResponse = await listHabits(authRequest(`${baseUrl}/api/habits`));
    await expect(listResponse.json()).resolves.toMatchObject({ habits: [] });

    const repos = createRepositories(tempDir!);
    await expect(repos.habitCheckins.list()).resolves.toHaveLength(1);
  });

  it("increments and decrements a multi-check habit up to its daily target", async () => {
    const habit = await createHabitJson({ name: "Drink water", targetCount: 3 });

    const first = await createCheckin(authRequest(`${baseUrl}/api/habits/${habit.id}/checkins`, { method: "POST" }), {
      params: { id: habit.id }
    });
    const second = await createCheckin(authRequest(`${baseUrl}/api/habits/${habit.id}/checkins`, { method: "POST" }), {
      params: { id: habit.id }
    });
    const third = await createCheckin(authRequest(`${baseUrl}/api/habits/${habit.id}/checkins`, { method: "POST" }), {
      params: { id: habit.id }
    });
    const fourth = await createCheckin(authRequest(`${baseUrl}/api/habits/${habit.id}/checkins`, { method: "POST" }), {
      params: { id: habit.id }
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(fourth.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ checkin: { completedCount: 1, isCompleted: false } });
    await expect(second.json()).resolves.toMatchObject({ checkin: { completedCount: 2, isCompleted: false } });
    await expect(third.json()).resolves.toMatchObject({ checkin: { completedCount: 3, isCompleted: true } });
    await expect(fourth.json()).resolves.toMatchObject({ checkin: { completedCount: 3, isCompleted: true } });

    const repos = createRepositories(tempDir!);
    await expect(repos.habitCheckins.list()).resolves.toHaveLength(1);

    const deleteResponse = await deleteCheckin(
      authRequest(`${baseUrl}/api/habits/${habit.id}/checkins/2026-05-08`, { method: "DELETE" }),
      { params: { id: habit.id, date: "2026-05-08" } }
    );
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toMatchObject({ checkin: { completedCount: 2, isCompleted: false } });
  });

  it("rejects a daily target greater than five", async () => {
    const response = await createHabit(
      authRequest(`${baseUrl}/api/habits`, {
        method: "POST",
        body: JSON.stringify({ name: "Too many", targetCount: 6 })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid habit payload" });
  });

  it("uses the previous business date before 02:00 server time", async () => {
    vi.setSystemTime(new Date(2026, 4, 8, 1, 30, 0));
    const habit = await createHabitJson({ name: "Read" });

    const response = await createCheckin(authRequest(`${baseUrl}/api/habits/${habit.id}/checkins`, { method: "POST" }), {
      params: { id: habit.id }
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      checkin: { habitId: habit.id, date: "2026-05-07" }
    });
  });

  it("rejects invalid habit payloads", async () => {
    const response = await createHabit(
      authRequest(`${baseUrl}/api/habits`, {
        method: "POST",
        body: JSON.stringify({ name: "" })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid habit payload" });
  });
});

async function createHabitJson(overrides: Record<string, unknown>): Promise<Habit> {
  const response = await createHabit(
    authRequest(`${baseUrl}/api/habits`, {
      method: "POST",
      body: JSON.stringify(overrides)
    })
  );

  expect(response.status).toBe(201);
  return ((await response.json()) as { habit: Habit }).habit;
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
