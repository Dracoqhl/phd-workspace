import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as testAi } from "@/app/api/ai/test/route";

const appPassword = "correct-password";
const sessionSecret = "session-secret";
const baseUrl = "http://localhost";

let cookieHeader = "";

beforeEach(async () => {
  vi.stubEnv("APP_PASSWORD", appPassword);
  vi.stubEnv("SESSION_SECRET", sessionSecret);

  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { password: appPassword }));
  cookieHeader = getSessionCookie(response);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
