"use client";

import { PlugZap, Send } from "lucide-react";
import { useState } from "react";

interface AiTestResponse {
  ok: boolean;
  model?: string;
  error?: string;
}

interface AiChatResponse {
  ok: boolean;
  reply?: string;
  error?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let fallbackMessageIdCounter = 0;

export function AiAssistantPanel() {
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("Not tested");
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

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

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) {
      return;
    }

    const userMessage: ChatMessage = { id: createChatMessageId(), role: "user", content };
    setChatMessages((messages) => [...messages, userMessage]);
    setDraft("");
    setSending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: content })
      });
      const payload = (await response.json()) as AiChatResponse;
      const assistantMessage: ChatMessage = {
        id: createChatMessageId(),
        role: "assistant",
        content: payload.ok ? payload.reply ?? "" : payload.error ?? "AI chat failed"
      };

      setChatMessages((messages) => [...messages, assistantMessage]);
    } catch {
      setChatMessages((messages) => [
        ...messages,
        { id: createChatMessageId(), role: "assistant", content: "AI chat failed" }
      ]);
    } finally {
      setSending(false);
    }
  }

  const statusClass =
    isConnected === true
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : isConnected === false
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <aside
      aria-label="AI 助手"
      className="flex min-h-48 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-[30%] lg:self-start"
    >
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
      <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${statusClass}`} role="status">
        {message}
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        <div
          aria-label="AI conversation history"
          className="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain rounded-md border border-slate-100 bg-slate-50 p-3"
          role="log"
        >
          {chatMessages.length === 0 ? (
            <p className="text-sm leading-6 text-slate-500">可以问我如何安排今天、拆解任务或整理当前任务。</p>
          ) : (
            chatMessages.map((chatMessage) => (
              <div
                className={`max-w-[92%] rounded-md px-3 py-2 text-sm leading-6 ${
                  chatMessage.role === "user"
                    ? "ml-auto bg-ink text-white"
                    : "mr-auto border border-slate-200 bg-white text-slate-700"
                }`}
                key={chatMessage.id}
              >
                {chatMessage.content}
              </div>
            ))
          )}
        </div>

        <form
          className="flex shrink-0 items-end gap-2 border-t border-slate-100 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <label className="sr-only" htmlFor="ai-message">
            AI message
          </label>
          <textarea
            aria-label="AI message"
            className="min-h-16 flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm leading-5 text-ink outline-none focus:border-slate-400"
            disabled={sending}
            id="ai-message"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about today's plan..."
            value={draft}
          />
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            disabled={sending || draft.trim().length === 0}
            type="submit"
          >
            <Send aria-hidden="true" size={14} />
            Send
          </button>
        </form>
      </div>
    </aside>
  );
}

function createChatMessageId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) {
    return `chat-${randomUUID()}`;
  }

  fallbackMessageIdCounter += 1;
  return `chat-${Date.now().toString(36)}-${fallbackMessageIdCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
