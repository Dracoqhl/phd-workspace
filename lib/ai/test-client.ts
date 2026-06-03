import type { AiConfig } from "@/lib/ai/config";
import { generateAiText } from "@/lib/ai/client";

export interface AiTestResult {
  ok: boolean;
  model?: string;
  error?: string;
}

export async function testAiConnection(config: AiConfig): Promise<AiTestResult> {
  try {
    const content = await generateAiText(config, {
      messages: [{ role: "user", content: "Reply with ok." }],
      maxTokens: 8,
      temperature: 0
    });

    return content ? { ok: true, model: config.model } : { ok: false, error: "AI test failed" };
  } catch {
    return { ok: false, error: "AI test failed" };
  }
}
