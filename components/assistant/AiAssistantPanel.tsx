"use client";

import { CheckCircle2, PlugZap, Send, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { AiActionProposal, AiActionStatus } from "@/types/assistant";
import type { AiChatActionState } from "@/types/ai-chat";

interface AiTestResponse {
  ok: boolean;
  model?: string;
  error?: string;
}

interface AiChatResponse {
  ok: boolean;
  reply?: string;
  proposals?: AiActionProposal[];
  error?: string;
}

interface AiChatHistoryResponse {
  messages?: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    proposals?: AiActionProposal[];
    actionState?: AiChatActionState;
    actionStatus?: string;
    createdAt: string;
  }>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "error" | "done";
  proposals?: AiActionProposal[];
  proposalUserMessage?: string;
  actionState?: AiChatActionState;
  actionStatus?: string;
}

interface AiActionConfirmResponse {
  ok: boolean;
  results?: Array<{ proposalId: string; actionType?: string; status: AiActionStatus; error?: string }>;
  error?: string;
}

let fallbackMessageIdCounter = 0;
const fieldControlClass = "border-field-border bg-field text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20";

export function AiAssistantPanel() {
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("Not tested");
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadHistory() {
      try {
        const response = await fetch("/api/ai/chat/history");
        if (!response.ok) return;
        const payload = (await response.json()) as AiChatHistoryResponse;
        if (ignore || !Array.isArray(payload.messages)) return;
        let lastUserMessage = "";
        const historyMessages: ChatMessage[] = payload.messages.map((message) => {
          if (message.role === "user") {
            lastUserMessage = message.content;
          }

          return {
            id: message.id,
            role: message.role,
            content: message.content,
            status: "done",
            proposals: message.proposals,
            proposalUserMessage: message.role === "assistant" && message.proposals?.length ? lastUserMessage : undefined,
            actionState: message.actionState,
            actionStatus: message.actionStatus
          };
        });
        setChatMessages((current) => (current.length > 0 ? current : historyMessages));
      } catch {
        // History is a convenience; chat remains usable if loading fails.
      }
    }

    void loadHistory();
    return () => {
      ignore = true;
    };
  }, []);

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

    const userMessage: ChatMessage = { id: createChatMessageId(), role: "user", content, status: "done" };
    const assistantMessageId = createChatMessageId();
    const pendingAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "Thinking...",
      status: "pending",
      proposalUserMessage: content
    };
    setChatMessages((messages) => [...messages, userMessage, pendingAssistantMessage]);
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
        id: assistantMessageId,
        role: "assistant",
        content: payload.ok ? payload.reply ?? "" : payload.error ?? "AI chat failed",
        status: payload.ok ? "done" : "error",
        proposals: payload.ok ? payload.proposals ?? [] : [],
        proposalUserMessage: content
      };

      setChatMessages((messages) => messages.map((message) => (message.id === assistantMessageId ? assistantMessage : message)));
    } catch {
      setChatMessages((messages) =>
        messages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: "AI chat failed", status: "error", proposals: [] }
            : message
        )
      );
    } finally {
      setSending(false);
    }
  }

  async function clearChatHistory() {
    if (clearingHistory || chatMessages.length === 0) return;

    setClearingHistory(true);
    try {
      const response = await fetch("/api/ai/chat/history", { method: "DELETE" });
      if (response.ok) {
        setChatMessages([]);
      }
    } finally {
      setClearingHistory(false);
    }
  }

  const statusClass =
    isConnected === true
      ? "border-success bg-success-soft text-success-text"
      : isConnected === false
        ? "border-danger bg-danger-soft text-danger-text"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <aside
      aria-label="AI 助手"
      className="flex min-h-48 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">AI 助手</h2>
        <div className="flex items-center gap-2">
          {chatMessages.length > 0 ? (
            <button
              aria-label="Clear chat history"
              className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
              disabled={clearingHistory}
              onClick={() => void clearChatHistory()}
              type="button"
            >
              Clear
            </button>
          ) : null}
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
      </div>
      <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${statusClass}`} role="status">
        {message}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        AI 仅用于维护任务、习惯、计划和 Quote 设置。
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        <div
          aria-label="AI conversation history"
          className="custom-scrollbar flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain rounded-md border border-slate-100 bg-slate-50 p-3 pr-2"
          role="log"
        >
          {chatMessages.length === 0 ? (
            <p className="text-sm leading-6 text-slate-500">
              可以问我如何安排今天、拆解任务或整理当前任务。也可以指定 Quote 的内容或类型。
            </p>
          ) : (
            chatMessages.map((chatMessage) => (
              <ChatMessageBubble
                chatMessage={chatMessage}
                key={chatMessage.id}
                onActionStateChange={(actionState, actionStatus) => {
                  setChatMessages((messages) =>
                    messages.map((message) =>
                      message.id === chatMessage.id ? { ...message, actionState, actionStatus } : message
                    )
                  );
                }}
              />
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
            className={`min-h-16 flex-1 resize-none rounded-md border px-3 py-2 text-sm leading-5 ${fieldControlClass}`}
            disabled={sending}
            id="ai-message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask about today's plan..."
            value={draft}
          />
          <button
            aria-label="Send message"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-ink text-white hover:bg-slate-700 disabled:opacity-50"
            disabled={sending || draft.trim().length === 0}
            type="submit"
          >
            <Send aria-hidden="true" size={15} />
          </button>
        </form>
      </div>
    </aside>
  );
}

function ChatMessageBubble({
  chatMessage,
  onActionStateChange
}: {
  chatMessage: ChatMessage;
  onActionStateChange: (actionState: ChatMessage["actionState"], actionStatus: string) => void;
}) {
  return (
    <div
      className={`max-w-[92%] rounded-md px-3 py-2 text-sm leading-6 ${
        chatMessage.role === "user"
          ? "ml-auto bg-ink text-white"
          : "mr-auto border border-slate-200 bg-white text-slate-700"
      }`}
    >
      {chatMessage.status === "pending" ? (
        <div
          aria-label="AI response status"
          className="inline-flex items-center gap-2 text-slate-500"
          role="status"
        >
          <span>{chatMessage.content}</span>
          <span className="inline-flex gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:240ms]" />
          </span>
        </div>
      ) : (
        <MessageContent chatMessage={chatMessage} />
      )}
      {chatMessage.role === "assistant" && chatMessage.proposals && chatMessage.proposals.length > 0 ? (
        <ProposalCard
          actionState={chatMessage.actionState ?? "pending"}
          actionStatus={chatMessage.actionStatus}
          onActionStateChange={onActionStateChange}
          proposals={chatMessage.proposals}
          userMessage={chatMessage.proposalUserMessage ?? ""}
        />
      ) : null}
    </div>
  );
}

function MessageContent({ chatMessage }: { chatMessage: ChatMessage }) {
  const commonClass = `whitespace-pre-wrap ${
    chatMessage.status === "error" ? "text-danger-text" : ""
  }`;

  if (chatMessage.role === "user") {
    return (
      <div className={commonClass} data-testid="chat-message-user">
        {chatMessage.content}
      </div>
    );
  }

  return (
    <div className={`markdown-message ${commonClass}`} data-testid="chat-message-assistant">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-1 list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 list-decimal space-y-1 pl-4">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.92em]">{children}</code>,
          pre: ({ children }) => (
            <pre className="custom-scrollbar my-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs leading-5">{children}</pre>
          )
        }}
        skipHtml
      >
        {chatMessage.content}
      </ReactMarkdown>
    </div>
  );
}

function ProposalCard({
  proposals,
  userMessage,
  actionState,
  actionStatus,
  onActionStateChange
}: {
  proposals: AiActionProposal[];
  userMessage: string;
  actionState: NonNullable<ChatMessage["actionState"]>;
  actionStatus?: string;
  onActionStateChange: (actionState: ChatMessage["actionState"], actionStatus: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(proposals.map((proposal) => proposal.id)));
  const [submitting, setSubmitting] = useState(false);

  async function submitDecision(decision: "confirm" | "reject") {
    const selected = decision === "reject" ? proposals : proposals.filter((proposal) => selectedIds.has(proposal.id));
    if (selected.length === 0) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/ai/actions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, userMessage, proposals: selected })
      });
      const payload = (await response.json()) as AiActionConfirmResponse;
      if (!response.ok || !payload.ok || !payload.results) {
        throw new Error(payload.error ?? "AI action failed");
      }

      if (decision === "reject") {
        onActionStateChange("rejected", "已取消这些建议。");
        return;
      }

      const executedCount = payload.results.filter((result) => result.status === "confirmed_executed").length;
      const failedCount = payload.results.filter((result) => result.status === "failed").length;
      const executedActionTypes = new Set(
        payload.results
          .filter((result) => result.status === "confirmed_executed")
          .map((result) => result.actionType ?? selected.find((proposal) => proposal.id === result.proposalId)?.actionType)
          .filter((actionType): actionType is string => typeof actionType === "string")
      );
      if (hasTaskAction(executedActionTypes)) {
        window.dispatchEvent(new Event("phd-workspace:tasks-refresh"));
      }
      if (hasHabitAction(executedActionTypes)) {
        window.dispatchEvent(new Event("phd-workspace:habits-refresh"));
      }
      onActionStateChange(
        failedCount > 0 ? "failed" : "executed",
        failedCount > 0 ? `已执行 ${executedCount} 项，${failedCount} 项失败。` : `已执行 ${executedCount} 项建议。`
      );
    } catch (caught) {
      onActionStateChange("failed", caught instanceof Error ? caught.message : "AI action failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-proposal bg-proposal-soft p-2 text-xs text-primary">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-proposal-text">操作建议</span>
        {actionState !== "pending" ? <span className="text-slate-600">{actionStatus}</span> : null}
      </div>
      <div className="custom-scrollbar grid max-h-64 gap-1.5 overflow-y-auto pr-1" data-testid="ai-proposal-list">
        {proposals.map((proposal) => (
          <label className="flex items-start gap-2 rounded border border-proposal bg-surface px-2 py-1.5" key={proposal.id}>
            <input
              aria-label={`Select ${proposal.summary}`}
              checked={selectedIds.has(proposal.id)}
              className="mt-1"
              disabled={actionState !== "pending" || submitting}
              onChange={(event) => {
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(proposal.id);
                  else next.delete(proposal.id);
                  return next;
                });
              }}
              type="checkbox"
            />
            <span className="leading-5">{proposal.summary}</span>
          </label>
        ))}
      </div>
      {actionState === "pending" ? (
        <div className="mt-2 flex gap-2">
          <button
            className="inline-flex h-7 items-center gap-1 rounded-md bg-ink px-2 text-xs font-semibold text-white disabled:opacity-50"
            disabled={submitting || selectedIds.size === 0}
            onClick={() => void submitDecision("confirm")}
            type="button"
          >
            <CheckCircle2 aria-hidden="true" size={13} />
            Apply
          </button>
          <button
            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
            disabled={submitting}
            onClick={() => void submitDecision("reject")}
            type="button"
          >
            <XCircle aria-hidden="true" size={13} />
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function hasTaskAction(actionTypes: Set<string>): boolean {
  return ["create_task", "create_subtask", "update_task", "delete_task"].some((actionType) => actionTypes.has(actionType));
}

function hasHabitAction(actionTypes: Set<string>): boolean {
  return ["create_habit", "update_habit", "deactivate_habit", "habit_checkin", "habit_checkin_cancel"].some((actionType) =>
    actionTypes.has(actionType)
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
