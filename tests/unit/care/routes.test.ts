import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as checkinCare } from "@/app/api/care/checkin/route";
import { POST as generateCare } from "@/app/api/care/generate/route";
import { GET as getTodayCare } from "@/app/api/care/today/route";
import { createRepositories } from "@/lib/data/repositories";

const appPassword = "correct-password";
const sessionSecret = "session-secret";
const baseUrl = "http://localhost";

let tempDir: string | null = null;
let cookieHeader = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "phd-care-routes-"));
  vi.stubEnv("APP_PASSWORD", appPassword);
  vi.stubEnv("SESSION_SECRET", sessionSecret);
  vi.stubEnv("DATA_DIR", tempDir);
  vi.setSystemTime(new Date(2026, 4, 8, 9, 0, 0));

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

describe("care routes", () => {
  it("rejects unauthenticated care requests", async () => {
    const response = await getTodayCare(new Request(`${baseUrl}/api/care/today`));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns today's fallback care record when no AI configuration is available", async () => {
    const response = await getTodayCare(authRequest(`${baseUrl}/api/care/today`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: {
        date: "2026-05-08",
        source: "fallback",
        isChecked: false,
        moodNote: ""
      }
    });

    const repos = createRepositories(tempDir!);
    await expect(repos.careRecords.list()).resolves.toHaveLength(1);
  });

  it("reuses today's existing care record", async () => {
    const firstResponse = await getTodayCare(authRequest(`${baseUrl}/api/care/today`));
    const first = (await firstResponse.json()) as { care: { id: string } };

    const secondResponse = await getTodayCare(authRequest(`${baseUrl}/api/care/today`));
    const second = (await secondResponse.json()) as { care: { id: string } };

    expect(second.care.id).toBe(first.care.id);
    const repos = createRepositories(tempDir!);
    await expect(repos.careRecords.list()).resolves.toHaveLength(1);
  });

  it("refreshes today's care content without clearing existing check-in state", async () => {
    await getTodayCare(authRequest(`${baseUrl}/api/care/today`));
    await checkinCare(
      authRequest(`${baseUrl}/api/care/checkin`, {
        method: "POST",
        body: JSON.stringify({ isChecked: true, moodNote: "Tired but steady" })
      })
    );

    const response = await generateCare(authRequest(`${baseUrl}/api/care/generate`, { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: {
        date: "2026-05-08",
        source: "fallback",
        isChecked: true,
        moodNote: "Tired but steady"
      }
    });
  });

  it("checks in today's care record and stores the mood note", async () => {
    const response = await checkinCare(
      authRequest(`${baseUrl}/api/care/checkin`, {
        method: "POST",
        body: JSON.stringify({ isChecked: true, moodNote: "A calmer start" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: {
        date: "2026-05-08",
        isChecked: true,
        moodNote: "A calmer start"
      }
    });
  });
});

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
