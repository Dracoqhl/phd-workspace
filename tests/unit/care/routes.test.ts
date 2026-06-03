import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as generateCare } from "@/app/api/care/generate/route";
import { GET as getTodayCare } from "@/app/api/care/today/route";
import { POST as updateCare } from "@/app/api/care/update/route";
import { createRepositories } from "@/lib/data/repositories";
import { closeDatabase, getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import { DEFAULT_CARE_QUOTE_BATCH, DEFAULT_CARE_QUOTE_PREFERENCE } from "@/lib/domain/care";

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
  vi.unstubAllGlobals();
  closeDatabase();

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
        energyLevel: null,
        isFavorite: false,
        focusText: ""
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

  it("refreshes today's care content without clearing existing daily state", async () => {
    await getTodayCare(authRequest(`${baseUrl}/api/care/today`));
    await updateCare(
      authRequest(`${baseUrl}/api/care/update`, {
        method: "POST",
        body: JSON.stringify({ energyLevel: 2, isFavorite: true, focusText: "Revise intro" })
      })
    );

    const response = await generateCare(
      authRequest(`${baseUrl}/api/care/generate`, {
        method: "POST",
        body: JSON.stringify({ preferenceText: "偏长期计划，短一点" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: {
        date: "2026-05-08",
        source: "fallback",
        energyLevel: 2,
        isFavorite: true,
        focusText: "Revise intro"
      }
    });
  });

  it("generates today's care content with AI when configured", async () => {
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "gpt-test");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1/");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: "今天先把注意力放在一个可以完成的小步骤上。" } }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await updateCare(
      authRequest(`${baseUrl}/api/care/update`, {
        method: "POST",
        body: JSON.stringify({ energyLevel: 3, isFavorite: true, focusText: "Draft methods" })
      })
    );

    const response = await generateCare(
      authRequest(`${baseUrl}/api/care/generate`, {
        method: "POST",
        body: JSON.stringify({ preferenceText: "偏长期计划，短一点" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: {
        date: "2026-05-08",
        content: "今天先把注意力放在一个可以完成的小步骤上。",
        source: "ai_generated",
        energyLevel: 3,
        isFavorite: true,
        focusText: "Draft methods"
      }
    });
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
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "gpt-test",
      max_tokens: 900,
      temperature: 0.8
    });
  });

  it("generates today's care content from streaming Responses output for gpt-5 models", async () => {
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "gpt-5.5");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1/");
    const fetchMock = vi.fn().mockResolvedValue(createTextStreamResponse(JSON.stringify(["慢慢来，先完成一个小步骤。"])));
    vi.stubGlobal("fetch", fetchMock);

    const response = await generateCare(
      authRequest(`${baseUrl}/api/care/generate`, {
        method: "POST",
        body: JSON.stringify({ preferenceText: "温和一点" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: {
        content: "慢慢来，先完成一个小步骤。",
        source: "ai_generated"
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/v1/responses", expect.any(Object));
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string) as { instructions: string; input: Array<{ content: Array<{ text: string }> }>; stream: boolean };
    expect(body.instructions).toContain("daily care quotes");
    expect(body.input[0].content[0].text).toContain("Generate");
    expect(body.stream).toBe(true);
  });

  it("stores a per-user quote batch and regenerates it only when the preference changes", async () => {
    vi.stubEnv("DATABASE_PATH", join(tempDir!, "workspace.sqlite"));
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_PASSWORD", "admin-password");
    ensureDatabaseSchema(getDatabase());
    const dbCookie = await loginAndGetCookie("admin@example.com", "admin-password");
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "gpt-test");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1/");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: JSON.stringify(["第一条计划 quote。", "第二条计划 quote。", "第三条计划 quote。"]) } }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const firstResponse = await generateCare(
      authRequest(`${baseUrl}/api/care/generate`, {
        method: "POST",
        headers: { Cookie: dbCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ preferenceText: "偏长期计划，短一点" })
      })
    );
    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({
      care: { content: "第一条计划 quote。", source: "ai_generated" },
      quotePreference: "偏长期计划，短一点",
      quoteBatch: ["第一条计划 quote。", "第二条计划 quote。", "第三条计划 quote。"],
      quoteIndex: 0
    });

    const todayResponse = await getTodayCare(authRequest(`${baseUrl}/api/care/today`, { headers: { Cookie: dbCookie } }));
    await expect(todayResponse.json()).resolves.toMatchObject({
      quotePreference: "偏长期计划，短一点",
      quoteBatch: ["第一条计划 quote。", "第二条计划 quote。", "第三条计划 quote。"],
      quoteIndex: 0
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const reusedResponse = await generateCare(
      authRequest(`${baseUrl}/api/care/generate`, {
        method: "POST",
        headers: { Cookie: dbCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ preferenceText: "偏长期计划，短一点" })
      })
    );
    expect(reusedResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("restores the default quote batch without calling AI", async () => {
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "gpt-test");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1/");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: JSON.stringify(["自定义第一条。", "自定义第二条。"]) } }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateCare(
      authRequest(`${baseUrl}/api/care/generate`, {
        method: "POST",
        body: JSON.stringify({ preferenceText: "自定义励志诗句" })
      })
    );

    const response = await generateCare(
      authRequest(`${baseUrl}/api/care/generate`, {
        method: "POST",
        body: JSON.stringify({ preferenceText: DEFAULT_CARE_QUOTE_PREFERENCE })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: { content: DEFAULT_CARE_QUOTE_BATCH[0], source: "fallback" },
      quotePreference: DEFAULT_CARE_QUOTE_PREFERENCE,
      quoteBatch: DEFAULT_CARE_QUOTE_BATCH,
      quoteIndex: 0
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back when AI care generation fails", async () => {
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "gpt-test");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "bad key" }, { status: 401 })));

    const response = await generateCare(authRequest(`${baseUrl}/api/care/generate`, { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: {
        date: "2026-05-08",
        source: "fallback"
      }
    });
  });

  it("updates today's energy, favorite state, and focus text", async () => {
    const response = await updateCare(
      authRequest(`${baseUrl}/api/care/update`, {
        method: "POST",
        body: JSON.stringify({ energyLevel: 5, isFavorite: true, focusText: "Finish one figure" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      care: {
        date: "2026-05-08",
        energyLevel: 5,
        isFavorite: true,
        focusText: "Finish one figure"
      }
    });
  });

  it("rejects invalid care updates", async () => {
    const response = await updateCare(
      authRequest(`${baseUrl}/api/care/update`, {
        method: "POST",
        body: JSON.stringify({ energyLevel: 6 })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid care payload" });
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

function createTextStreamResponse(text: string): Response {
  const event = [
    "event: response.output_text.delta",
    `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}`,
    "",
    "event: response.completed",
    `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}`,
    "",
    ""
  ].join("\n");

  return new Response(event, { headers: { "Content-Type": "text/event-stream" } });
}

function getSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected login response to set a cookie");
  }

  return setCookie.split(";")[0];
}

async function loginAndGetCookie(email: string, password: string): Promise<string> {
  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { email, password }));
  expect(response.status).toBe(200);
  return getSessionCookie(response);
}
