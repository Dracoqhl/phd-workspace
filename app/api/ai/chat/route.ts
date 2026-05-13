import { requireAuth } from "@/lib/api/auth";
import {
  AI_CHAT_FAILED,
  INVALID_AI_CHAT_PAYLOAD,
  buildAiWorkspaceContext,
  dataConfigErrorResponse,
  parseAiChatInput,
  readJsonObject
} from "@/lib/api/ai-chat";
import { generateAiAssistantReply } from "@/lib/ai/chat";
import { getAiConfig } from "@/lib/ai/config";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";

export async function POST(request: Request): Promise<Response> {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await readJsonObject(request);
  const input = body ? parseAiChatInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_AI_CHAT_PAYLOAD }, { status: 400 });
  }

  const config = getAiConfig();
  if (!config) {
    return Response.json({ ok: false, error: "AI is not configured" });
  }

  let repositories: ReturnType<typeof createRepositories>;
  try {
    repositories = createRepositories(resolveDataDir());
  } catch {
    return dataConfigErrorResponse();
  }

  const context = await buildAiWorkspaceContext(repositories);
  const result = await generateAiAssistantReply(config, { userMessage: input.message, context });

  if (!result) {
    return Response.json({ ok: false, error: AI_CHAT_FAILED });
  }

  await Promise.all(
    result.proposals.map((proposal) =>
      repositories.aiLogs.add({
        id: proposal.id,
        userMessage: input.message,
        actionType: proposal.actionType,
        actionPayload: proposal.payload,
        status: "proposed",
        createdAt: new Date().toISOString()
      })
    )
  );

  return Response.json({
    ok: true,
    reply: result.reply,
    ...(result.proposals.length > 0 ? { proposals: result.proposals } : {})
  });
}
