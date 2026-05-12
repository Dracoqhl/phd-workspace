"use client";

import { PlugZap } from "lucide-react";
import { useState } from "react";

interface AiTestResponse {
  ok: boolean;
  model?: string;
  error?: string;
}

export function AiAssistantPanel() {
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("Not tested");
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  async function testAi() {
    setTesting(true);
    setMessage("Testing...");
    setIsConnected(null);

    try {
      const response = await fetch("/api/ai/test", { method: "POST" });
      const payload = (await response.json()) as AiTestResponse;

      if (payload.ok) {
        setIsConnected(true);
        setMessage(`AI connected: ${payload.model ?? "configured model"}`);
        return;
      }

      setIsConnected(false);
      setMessage(payload.error ?? "AI test failed");
    } catch {
      setIsConnected(false);
      setMessage("AI test failed");
    } finally {
      setTesting(false);
    }
  }

  const statusClass =
    isConnected === true
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : isConnected === false
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <aside aria-label="AI 助手" className="min-h-48 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:w-[30%]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">AI 助手</h2>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          disabled={testing}
          onClick={() => void testAi()}
          type="button"
        >
          <PlugZap aria-hidden="true" size={14} />
          Test AI
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">聊天、任务拆解和确认卡片会在后续阶段接入。</p>
      <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${statusClass}`} role="status">
        {message}
      </p>
    </aside>
  );
}
