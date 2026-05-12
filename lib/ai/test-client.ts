import type { AiConfig } from "@/lib/ai/config";

export interface AiTestResult {
  ok: boolean;
  model?: string;
  error?: string;
}

export async function testAiConnection(config: AiConfig): Promise<AiTestResult> {
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Reply with ok." }],
        max_tokens: 8,
        temperature: 0
      })
    });

    if (!response.ok) {
      return { ok: false, error: "AI test failed" };
    }

    return { ok: true, model: config.model };
  } catch {
    return { ok: false, error: "AI test failed" };
  }
}
