import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { POST as chat } from "@/app/api/ai/chat/route";
import { POST as confirmActions } from "@/app/api/ai/actions/confirm/route";
import { GET as getAiLogs } from "@/app/api/ai/logs/route";
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

  it("returns structured operation proposals without writing data", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "phd-ai-chat-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1/");

    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "我建议先新增一个整理数据任务。",
                proposals: [
                  {
                    actionType: "create_task",
                    summary: "新增任务：整理实验数据",
                    payload: {
                      title: "整理实验数据",
                      description: "",
                      priority: "high",
                      dueDate: "2026-05-18",
                      status: "not_started",
                      parentTaskId: null
                    }
                  }
                ]
              })
            }
          }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await chat(
      authRequest(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        body: JSON.stringify({ message: "帮我创建一个整理数据任务" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      reply: "我建议先新增一个整理数据任务。",
      proposals: [
        {
          actionType: "create_task",
          summary: "新增任务：整理实验数据",
          riskLevel: "low",
          payload: {
            title: "整理实验数据",
            priority: "high"
          }
        }
      ]
    });

    const repositories = createRepositories(dataDir);
    await expect(repositories.tasks.list()).resolves.toEqual([]);
    await expect(repositories.aiLogs.list()).resolves.toHaveLength(1);
  });
});

describe("AI action confirm route", () => {
  it("rejects unauthenticated action confirmation", async () => {
    const response = await confirmActions(jsonRequest(`${baseUrl}/api/ai/actions/confirm`, { proposals: [] }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("creates selected task proposals and logs execution", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "phd-ai-actions-"));
    vi.stubEnv("DATA_DIR", dataDir);

    const response = await confirmActions(
      authRequest(`${baseUrl}/api/ai/actions/confirm`, {
        method: "POST",
        body: JSON.stringify({
          userMessage: "帮我创建整理数据任务",
          proposals: [
            {
              id: "proposal_1",
              actionType: "create_task",
              summary: "新增任务：整理实验数据",
              payload: {
                title: "整理实验数据",
                description: "",
                status: "not_started",
                priority: "high",
                dueDate: "2026-05-18",
                parentTaskId: null
              }
            }
          ]
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      results: [{ proposalId: "proposal_1", status: "confirmed_executed" }]
    });

    const repositories = createRepositories(dataDir);
    await expect(repositories.tasks.list()).resolves.toMatchObject([{ title: "整理实验数据", priority: "high" }]);
    await expect(repositories.aiLogs.list()).resolves.toMatchObject([
      { userMessage: "帮我创建整理数据任务", actionType: "create_task", status: "confirmed_executed" }
    ]);
  });

  it("creates a new parent task and following subtask proposals in the same confirmation batch", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "phd-ai-actions-"));
    vi.stubEnv("DATA_DIR", dataDir);

    const response = await confirmActions(
      authRequest(`${baseUrl}/api/ai/actions/confirm`, {
        method: "POST",
        body: JSON.stringify({
          userMessage: "帮我拆分论文任务",
          proposals: [
            {
              id: "parent_proposal",
              actionType: "create_task",
              summary: "新增任务：完成论文初稿",
              payload: {
                title: "完成论文初稿",
                description: "",
                status: "not_started",
                priority: "high",
                dueDate: "2026-05-20",
                parentTaskId: null
              }
            },
            {
              id: "child_1",
              actionType: "create_subtask",
              summary: "新增子任务：整理文献",
              payload: {
                parentProposalId: "parent_proposal",
                title: "整理文献",
                description: "",
                status: "not_started",
                priority: "medium",
                dueDate: null
              }
            },
            {
              id: "child_2",
              actionType: "create_subtask",
              summary: "新增子任务：写方法部分",
              payload: {
                title: "写方法部分",
                description: "",
                status: "not_started",
                priority: "medium",
                dueDate: null
              }
            }
          ]
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      results: [
        { proposalId: "parent_proposal", status: "confirmed_executed" },
        { proposalId: "child_1", status: "confirmed_executed" },
        { proposalId: "child_2", status: "confirmed_executed" }
      ]
    });

    const repositories = createRepositories(dataDir);
    const tasks = await repositories.tasks.list();
    const parent = tasks.find((task) => task.title === "完成论文初稿");
    expect(parent).toBeDefined();
    expect(tasks.filter((task) => task.parentTaskId === parent?.id).map((task) => task.title)).toEqual([
      "整理文献",
      "写方法部分"
    ]);
  });

  it("deletes tasks through trash and rejects proposals without writing business data", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "phd-ai-actions-"));
    vi.stubEnv("DATA_DIR", dataDir);
    const repositories = createRepositories(dataDir);
    const task = await repositories.tasks.create({
      title: "Temporary task",
      description: "",
      status: "not_started",
      priority: "medium",
      dueDate: null,
      parentTaskId: null
    });

    const deleteResponse = await confirmActions(
      authRequest(`${baseUrl}/api/ai/actions/confirm`, {
        method: "POST",
        body: JSON.stringify({
          userMessage: "删除临时任务",
          proposals: [{ id: "delete_1", actionType: "delete_task", summary: "删除任务", payload: { taskId: task.id } }]
        })
      })
    );

    expect(deleteResponse.status).toBe(200);
    await expect(repositories.tasks.list()).resolves.toEqual([]);
    await expect(repositories.trash.list()).resolves.toHaveLength(1);

    const rejectResponse = await confirmActions(
      authRequest(`${baseUrl}/api/ai/actions/confirm`, {
        method: "POST",
        body: JSON.stringify({
          decision: "reject",
          userMessage: "不要新建习惯",
          proposals: [
            {
              id: "habit_1",
              actionType: "create_habit",
              summary: "新增习惯：喝水",
              payload: { name: "喝水", description: "", icon: "", targetCount: 3 }
            }
          ]
        })
      })
    );

    expect(rejectResponse.status).toBe(200);
    await expect(repositories.habits.list()).resolves.toEqual([]);
    await expect(repositories.aiLogs.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionType: "delete_task", status: "confirmed_executed" }),
        expect.objectContaining({ actionType: "create_habit", status: "rejected" })
      ])
    );
  });

  it("lists AI action logs without exposing model secrets", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "phd-ai-actions-"));
    vi.stubEnv("DATA_DIR", dataDir);
    const repositories = createRepositories(dataDir);
    await repositories.aiLogs.add({
      id: "log_1",
      userMessage: "创建任务",
      actionType: "create_task",
      actionPayload: { title: "任务" },
      status: "proposed",
      createdAt: "2026-05-13T10:00:00.000Z"
    });

    const response = await getAiLogs(authRequest(`${baseUrl}/api/ai/logs`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      logs: [
        {
          id: "log_1",
          userMessage: "创建任务",
          actionType: "create_task",
          actionPayload: { title: "任务" },
          status: "proposed",
          createdAt: "2026-05-13T10:00:00.000Z"
        }
      ]
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
