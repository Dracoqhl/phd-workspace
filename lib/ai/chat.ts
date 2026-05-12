import type { AiConfig } from "@/lib/ai/config";

export interface AiAssistantContext {
  today: string;
  tasks: Array<{
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

export async function generateAiAssistantReply(
  config: AiConfig,
  input: { userMessage: string; context: AiAssistantContext }
): Promise<string | null> {
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
              "You are the AI assistant inside PhD Workspace. Use the provided workspace context to help the user plan, clarify, and break down work. You may suggest edits, but you cannot create, update, delete, or check in data in this phase. Reply in concise Chinese unless the user asks for another language."
          },
          {
            role: "user",
            content: `Current workspace context:\n${JSON.stringify(input.context, null, 2)}`
          },
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
    return content ? sanitizeChatContent(content) : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
