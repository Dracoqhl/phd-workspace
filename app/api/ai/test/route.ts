import { requireAuth } from "@/lib/api/auth";
import { getAiConfig } from "@/lib/ai/config";
import { testAiConnection } from "@/lib/ai/test-client";

export async function POST(request: Request): Promise<Response> {
  const authError = requireAuth(request);
  if (authError) return authError;

  const config = getAiConfig();
  if (!config) {
    return Response.json({ ok: false, error: "AI is not configured" });
  }

  const result = await testAiConnection(config);
  return Response.json(result);
}
