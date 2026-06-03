import type { AiConfig } from "@/lib/ai/config";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiTextRequest {
  messages: AiMessage[];
  maxTokens: number;
  temperature?: number;
}

export async function generateAiText(config: AiConfig, request: AiTextRequest): Promise<string | null> {
  if (usesResponsesApi(config.model)) {
    return generateResponsesText(config, request);
  }

  return generateChatCompletionsText(config, request);
}

function usesResponsesApi(model: string): boolean {
  return /^gpt-5(?:[.-]|$)/i.test(model.trim());
}

async function generateChatCompletionsText(config: AiConfig, request: AiTextRequest): Promise<string | null> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: getAiHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature })
    })
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as unknown;
  return parseChatCompletionsText(payload);
}

async function generateResponsesText(config: AiConfig, request: AiTextRequest): Promise<string | null> {
  const response = await fetch(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: getAiHeaders(config),
    body: JSON.stringify({
      model: config.model,
      ...buildResponsesInput(request.messages),
      max_output_tokens: request.maxTokens,
      stream: true
    })
  });

  if (!response.ok) return null;

  const eventStream = await response.text();
  return parseResponsesStreamText(eventStream);
}

function getAiHeaders(config: AiConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json"
  };
}

function buildResponsesInput(messages: AiMessage[]): {
  instructions?: string;
  input: Array<{ role: "user" | "assistant"; content: Array<{ type: "input_text"; text: string }> }>;
} {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: [{ type: "input_text" as const, text: message.content }]
    }));

  return {
    ...(instructions ? { instructions } : {}),
    input
  };
}

export function parseChatCompletionsText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const firstChoice = payload.choices[0] as unknown;
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }

  return typeof firstChoice.message.content === "string" ? firstChoice.message.content : null;
}

function parseResponsesStreamText(eventStream: string): string | null {
  let text = "";
  let completedText = "";

  for (const line of eventStream.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;

    const event = parseJsonObject(data);
    if (!event) continue;

    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      text += event.delta;
      continue;
    }

    if (event.type === "response.output_text.done" && typeof event.text === "string") {
      completedText = event.text;
      continue;
    }

    const outputText = parseCompletedResponseText(event);
    if (outputText) completedText = outputText;
  }

  const normalized = (text || completedText).trim();
  return normalized ? normalized : null;
}

function parseCompletedResponseText(event: Record<string, unknown>): string | null {
  if (event.type !== "response.completed" || !isRecord(event.response) || !Array.isArray(event.response.output)) {
    return null;
  }

  return event.response.output
    .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
