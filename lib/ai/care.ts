import type { AiConfig } from "@/lib/ai/config";

export async function generateAiCareContent(config: AiConfig): Promise<string | null> {
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
              "You write gentle, non-medical daily care messages for a PhD student. Avoid diagnosis, therapy instructions, crisis promises, shame, pressure, and overpromising. Keep it specific, calm, and supportive."
          },
          {
            role: "user",
            content: "Generate one concise Chinese daily care quote for today. Return only the quote, under 60 Chinese characters."
          }
        ],
        max_tokens: 180,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const content = parseChatContent(payload);
    return content ? sanitizeCareContent(content) : null;
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

function sanitizeCareContent(content: string): string | null {
  const sanitized = content.trim().replace(/^["“”]+|["“”]+$/g, "").trim();
  return sanitized.length > 0 ? sanitized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
