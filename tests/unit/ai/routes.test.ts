import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { POST as chat } from "@/app/api/ai/chat/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as testAi } from "@/app/api/ai/test/route";
import { createFallbackCareRecord } from "@/lib/domain/care";
import { getHabitBusinessDate } from "@/lib/domain/habits";
import { createRepositories } from "@/lib/data/repositories";

const appPassword = "correct-password";
const sessionSecret = "session-secret";
const baseUrl = "http://localhost";

let cookieHeader = "";
let dataDir: string | null = null;

beforeEach(async () => {
  vi.stubEnv("APP_PASSWORD", appPassword);
  vi.stubEnv("SESSION_SECRET", sessionSecret);

  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { password: appPassword }));
  cookieHeader = getSessionCookie(response);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();

  if (dataDir) {
    const dir = dataDir;
    dataDir = null;
    return rm(dir, { force: true, recursive: true });
  }
});

describe("AI test route", () => {
  it("rejects unauthenticated requests", async () => {
    const response = await testAi(new Request(`${baseUrl}/api/ai/test`, { method: "POST" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("reports missing AI configuration without exposing secrets", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    vi.stubEnv("AI_BASE_URL", "");

    const response = await testAi(authRequest(`${baseUrl}/api/ai/test`, { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "AI is not configured"
    });
  });

  it("calls an OpenAI-compatible chat completions endpoint", async () => {
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1/");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "chatcmpl_test" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await testAi(authRequest(`${baseUrl}/api/ai/test`, { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, model: "test-model" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ role: "user", content: "Reply with ok." }],
          max_tokens: 8,
          temperature: 0
        })
      })
    );
  });

  it("returns a safe unavailable result when the model endpoint fails", async () => {
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "bad key" }, { status: 401 })));

    const response = await testAi(authRequest(`${baseUrl}/api/ai/test`, { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "AI test failed"
    });
  });
});

describe("AI chat route", () => {
  it("rejects unauthenticated requests", async () => {
    const response = await chat(jsonRequest(`${baseUrl}/api/ai/chat`, { message: "帮我安排今天" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects invalid chat payloads", async () => {
    const response = await chat(authRequest(`${baseUrl}/api/ai/chat`, { method: "POST", body: JSON.stringify({ message: "" }) }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid AI chat payload" });
  });

  it("reports missing AI configuration without reading model secrets", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "phd-ai-chat-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    vi.stubEnv("AI_BASE_URL", "");

    const response = await chat(authRequest(`${baseUrl}/api/ai/chat`, { method: "POST", body: JSON.stringify({ message: "今天做什么" }) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "AI is not configured" });
  });

  it("sends current workspace context to the OpenAI-compatible endpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T12:00:00+08:00"));
    dataDir = await mkdtemp(join(tmpdir(), "phd-ai-chat-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1/");

    const repositories = createRepositories(dataDir);
    await repositories.tasks.create({
      title: "Draft introduction",
      description: "",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-05-14",
      parentTaskId: null
    });
    const habit = await repositories.habits.create({
      name: "Drink water",
      description: "",
      icon: "",
      targetCount: 3
    });
    await repositories.habitCheckins.complete(habit.id, getHabitBusinessDate(), habit.targetCount);
    await repositories.careRecords.upsertByDate("2026-05-12", (existing) => ({
      ...createFallbackCareRecord("2026-05-12", existing),
      focusText: "Finish one paragraph"
    }));

    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: "先完成引言段落，再补一次喝水。" } }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await chat(
      authRequest(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        body: JSON.stringify({ message: "帮我安排一下今天" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, reply: "先完成引言段落，再补一次喝水。" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json"
        }
      })
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
    const serializedMessages = body.messages.map((message) => message.content).join("\n");
    expect(serializedMessages).toContain("Draft introduction");
    expect(serializedMessages).toContain("Drink water");
    expect(serializedMessages).toContain("Finish one paragraph");
    expect(serializedMessages).toContain("帮我安排一下今天");
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
