import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiAssistantPanel } from "@/components/assistant/AiAssistantPanel";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiAssistantPanel", () => {
  it("renders a compact AI test control", () => {
    render(<AiAssistantPanel />);

    expect(screen.getByRole("heading", { name: "AI 助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test AI" })).toBeInTheDocument();
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
});
