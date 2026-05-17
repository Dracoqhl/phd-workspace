import { randomUUID } from "node:crypto";

import type { AiConfig } from "@/lib/ai/config";
import type { AiActionProposal, AiActionRiskLevel, AiActionType } from "@/types/assistant";
import type { AiChatMessage } from "@/types/ai-chat";

export interface AiAssistantContext {
  today: string;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    dueDate: string | null;
    parentTaskId: string | null;
  }>;
  habits: Array<{
    name: string;
    targetCount: number;
    completedCount: number;
    isCompleted: boolean;
  }>;
  care: {
    content: string;
    energyLevel: number | null;
    focusText: string;
  } | null;
}

export interface AiAssistantResult {
  reply: string;
  proposals: AiActionProposal[];
}

export async function generateAiAssistantReply(
  config: AiConfig,
  input: { userMessage: string; context: AiAssistantContext; history?: AiChatMessage[] }
): Promise<AiAssistantResult | null> {
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are the AI assistant inside PhD Workspace. Use the provided workspace context to help the user plan, clarify, and break down work. You may read all provided data without asking for confirmation. You must not claim that you executed any write. If the user asks to create, update, delete, or check in workspace data, return JSON only with this shape: {\"reply\":\"concise Chinese response\",\"proposals\":[{\"id\":\"stable_proposal_id\",\"actionType\":\"create_task|create_subtask|update_task|delete_task|create_habit|update_habit|deactivate_habit|habit_checkin|habit_checkin_cancel\",\"summary\":\"human readable Chinese summary\",\"payload\":{}}]}. Valid task statuses are not_started, next, in_progress, waiting, blocked, paused, and completed. For task updates/deletes use payload.taskId. For habit updates/deactivations/check-ins use payload.habitId. For subtasks of a newly proposed parent task, set payload.parentProposalId to the parent proposal id. If no write proposal is needed, return plain concise Chinese."
          },
          {
            role: "user",
            content: `Current workspace context:\n${JSON.stringify(input.context, null, 2)}`
          },
          ...(input.history && input.history.length > 0
            ? [
                {
                  role: "user",
                  content: `Recent chat history:\n${JSON.stringify(
                    input.history.map((message) => ({ role: message.role, content: message.content })),
                    null,
                    2
                  )}`
                }
              ]
            : []),
          {
            role: "user",
            content: input.userMessage
          }
        ],
        max_tokens: 700,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const content = parseChatContent(payload);
    return content ? parseAssistantContent(content) : null;
  } catch {
    return null;
  }
}

function parseChatContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const firstChoice = payload.choices[0] as unknown;
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }

  return typeof firstChoice.message.content === "string" ? firstChoice.message.content : null;
}

function sanitizeChatContent(content: string): string | null {
  const sanitized = content.trim();
  return sanitized.length > 0 ? sanitized : null;
}

function parseAssistantContent(content: string): AiAssistantResult | null {
  const sanitized = sanitizeChatContent(content);
  if (!sanitized) return null;

  const parsed = parseJsonObject(sanitized);
  if (!parsed) {
    return { reply: sanitized, proposals: [] };
  }

  const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : sanitized;
  const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.map(parseProposal).filter(isProposal) : [];

  return { reply, proposals };
}

function parseProposal(value: unknown): AiActionProposal | null {
  if (!isRecord(value)) return null;
  const actionType = parseActionType(value.actionType);
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const payload = isRecord(value.payload) ? value.payload : null;
  if (!actionType || !summary || !payload) return null;

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `proposal-${randomUUID()}`,
    actionType,
    summary,
    payload,
    riskLevel: parseRiskLevel(value.riskLevel) ?? riskLevelForAction(actionType)
  };
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(normalized) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseActionType(value: unknown): AiActionType | null {
  return value === "create_task" ||
    value === "create_subtask" ||
    value === "update_task" ||
    value === "delete_task" ||
    value === "create_habit" ||
    value === "update_habit" ||
    value === "deactivate_habit" ||
    value === "habit_checkin" ||
    value === "habit_checkin_cancel"
    ? value
    : null;
}

function parseRiskLevel(value: unknown): AiActionRiskLevel | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function riskLevelForAction(actionType: AiActionType): AiActionRiskLevel {
  return actionType === "delete_task" || actionType === "deactivate_habit" ? "high" : "low";
}

function isProposal(value: AiActionProposal | null): value is AiActionProposal {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
