import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByText("Not tested")).toBeInTheDocument();
  });

  it("shows a successful API test result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, model: "test-model" })));

    render(<AiAssistantPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Test AI" }));

    expect(await screen.findByText("AI connected: test-model")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/ai/test", expect.objectContaining({ method: "POST" }));
  });

  it("shows a clear unavailable result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, error: "AI is not configured" })));

    render(<AiAssistantPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Test AI" }));

    expect(await screen.findByRole("status")).toHaveTextContent("AI is not configured");
  });

  it("sends a chat message and renders the assistant reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, reply: "先完成一个最小任务。" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "今天应该先做什么？" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

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

  it("renders a chat failure as an assistant message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, error: "AI is not configured" })));

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "测试" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("AI is not configured")).toBeInTheDocument();
  });

  it("can send chat messages when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, reply: "收到。" })));

    render(<AiAssistantPanel />);

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "公网环境测试" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("公网环境测试")).toBeInTheDocument();
    expect(await screen.findByText("收到。")).toBeInTheDocument();
  });
});
