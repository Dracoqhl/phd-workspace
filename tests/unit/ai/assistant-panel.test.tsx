import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiAssistantPanel } from "@/components/assistant/AiAssistantPanel";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiAssistantPanel", () => {
  it("renders a compact AI test control", () => {
    render(<AiAssistantPanel />);

    expect(screen.getByRole("heading", { name: "AI 助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test AI" })).toBeInTheDocument();
    expect(screen.getByLabelText("AI message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "AI 助手" })).toHaveClass("flex-1");
    expect(screen.getByRole("log", { name: "AI conversation history" })).toHaveClass(
      "custom-scrollbar",
      "overflow-y-auto",
      "overscroll-contain"
    );
    expect(screen.getByText("Not tested")).toBeInTheDocument();
  });

  it("loads saved chat history when the assistant opens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          messages: [
            { id: "history_user", role: "user", content: "昨天的计划", createdAt: "2026-05-18T08:00:00.000Z" },
            { id: "history_assistant", role: "assistant", content: "继续完成实验记录。", createdAt: "2026-05-18T08:00:01.000Z" }
          ]
        })
      )
    );

    render(<AiAssistantPanel />);

    expect(await screen.findByText("昨天的计划")).toBeInTheDocument();
    expect(screen.getByText("继续完成实验记录。")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/ai/chat/history");
  });

  it("clears saved chat history from the assistant panel", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/ai/chat/history" && init?.method === "DELETE") {
        return Response.json({ ok: true });
      }

      return Response.json({
        messages: [{ id: "history_user", role: "user", content: "需要清空的历史", createdAt: "2026-05-18T08:00:00.000Z" }]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiAssistantPanel />);

    expect(await screen.findByText("需要清空的历史")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear chat history" }));

    await waitFor(() => expect(screen.queryByText("需要清空的历史")).not.toBeInTheDocument());
    expect(screen.getByText("可以问我如何安排今天、拆解任务或整理当前任务。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/chat/history", { method: "DELETE" });
  });

  it("shows a successful API test result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === "/api/ai/chat/history"
          ? Response.json({ messages: [] })
          : Response.json({ ok: true, model: "test-model" })
      )
    );

    render(<AiAssistantPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Test AI" }));

    expect(await screen.findByText("AI connected: test-model")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/ai/test", expect.objectContaining({ method: "POST" }));
  });

  it("shows a clear unavailable result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === "/api/ai/chat/history"
          ? Response.json({ messages: [] })
          : Response.json({ ok: false, error: "AI is not configured" })
      )
    );

    render(<AiAssistantPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Test AI" }));

    expect(await screen.findByRole("status")).toHaveTextContent("AI is not configured");
  });

  it("sends a chat message and renders the assistant reply", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/ai/chat/history"
        ? Response.json({ messages: [] })
        : Response.json({ ok: true, reply: "先完成一个最小任务。" })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "今天应该先做什么？" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("今天应该先做什么？")).toBeInTheDocument();
    expect(await screen.findByText("先完成一个最小任务。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "今天应该先做什么？" })
      })
    );
  });

  it("sends the chat message with Ctrl or Command plus Enter while plain Enter keeps editing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/ai/chat/history" ? Response.json({ messages: [] }) : Response.json({ ok: true, reply: "收到。" })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AiAssistantPanel />);

    const input = screen.getByLabelText("AI message");
    fireEvent.change(input, { target: { value: "第一行\n第二行" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/chat/history");

    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(await screen.findByText("收到。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "第一行\n第二行" })
      })
    );
  });

  it("preserves user line breaks and renders assistant markdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === "/api/ai/chat/history"
          ? Response.json({ messages: [] })
          : Response.json({
              ok: true,
              reply: "**建议**\n\n- 先完成引言\n- 再整理实验"
            })
      )
    );

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "第一行\n第二行" } });
    fireEvent.keyDown(screen.getByLabelText("AI message"), { key: "Enter", metaKey: true });

    const userMessage = await screen.findByTestId("chat-message-user");
    expect(userMessage).toHaveClass("whitespace-pre-wrap");
    expect(userMessage.textContent).toBe("第一行\n第二行");

    expect(await screen.findByText("建议")).toHaveClass("font-semibold");
    expect(screen.getByText("先完成引言").closest("li")).not.toBeNull();
    expect(screen.getByText("再整理实验").closest("li")).not.toBeNull();
  });

  it("shows a pending assistant status immediately while waiting for the reply", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input) === "/api/ai/chat/history" ? Promise.resolve(Response.json({ messages: [] })) : pendingResponse
      )
    );

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "帮我拆解任务" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("帮我拆解任务")).toBeInTheDocument();
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "AI response status" })).toHaveTextContent("Thinking...");

    resolveFetch(Response.json({ ok: true, reply: "可以，先列出三步。" }));

    expect(await screen.findByText("可以，先列出三步。")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Thinking...")).not.toBeInTheDocument());
  });

  it("renders selectable proposals and confirms checked actions", async () => {
    const eventSpy = vi.spyOn(window, "dispatchEvent");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/ai/chat") {
        return Response.json({
          ok: true,
          reply: "我整理了两个建议。",
          proposals: [
            {
              id: "proposal_1",
              actionType: "create_task",
              summary: "新增任务：整理实验数据",
              riskLevel: "low",
              payload: { title: "整理实验数据", description: "", status: "not_started", priority: "high", dueDate: null, parentTaskId: null }
            },
            {
              id: "proposal_2",
              actionType: "create_habit",
              summary: "新增习惯：喝水",
              riskLevel: "low",
              payload: { name: "喝水", description: "", icon: "", targetCount: 3 }
            }
          ]
        });
      }

      if (url === "/api/ai/chat/history") {
        return Response.json({ messages: [] });
      }

      if (url === "/api/ai/actions/confirm") {
        return Response.json({
          ok: true,
          results: [{ proposalId: "proposal_1", status: "confirmed_executed" }]
        });
      }

      throw new Error(`Unexpected request ${url} ${String(init?.method ?? "GET")}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "帮我安排一下" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("我整理了两个建议。")).toBeInTheDocument();
    expect(screen.getByText("新增任务：整理实验数据")).toBeInTheDocument();
    expect(screen.getByText("新增习惯：喝水")).toBeInTheDocument();
    expect(screen.getByTestId("ai-proposal-list")).toHaveClass("custom-scrollbar");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select 新增习惯：喝水" }));
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("已执行 1 项建议。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/actions/confirm",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("proposal_1")
      })
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/ai/actions/confirm",
      expect.objectContaining({
        body: expect.stringContaining("proposal_2")
      })
    );
    expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "phd-workspace:tasks-refresh" }));
  });

  it("renders a chat failure as an assistant message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === "/api/ai/chat/history"
          ? Response.json({ messages: [] })
          : Response.json({ ok: false, error: "AI is not configured" })
      )
    );

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "测试" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("AI is not configured")).toBeInTheDocument();
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("can send chat messages when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === "/api/ai/chat/history" ? Response.json({ messages: [] }) : Response.json({ ok: true, reply: "收到。" })
      )
    );

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "公网环境测试" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("公网环境测试")).toBeInTheDocument();
    expect(await screen.findByText("收到。")).toBeInTheDocument();
  });
});
