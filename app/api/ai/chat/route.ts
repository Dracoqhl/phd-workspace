import { requireUser } from "@/lib/api/auth";
import {
  AI_CHAT_FAILED,
  AI_CHAT_BOUNDARY_REPLY,
  INVALID_AI_CHAT_PAYLOAD,
  buildAiWorkspaceContext,
  dataConfigErrorResponse,
  isAiChatInputInScope,
  isAiChatOutputSafe,
  parseAiChatInput,
  readJsonObject
} from "@/lib/api/ai-chat";
import { generateAiAssistantReply } from "@/lib/ai/chat";
import { getAiConfig } from "@/lib/ai/config";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseAiChatInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_AI_CHAT_PAYLOAD }, { status: 400 });
  }

  if (!isAiChatInputInScope(input.message)) {
    return Response.json({ ok: true, reply: AI_CHAT_BOUNDARY_REPLY, boundary: "out_of_scope" });
  }

  const config = getAiConfig();
  if (!config) {
    return Response.json({ ok: false, error: "AI is not configured" });
  }

  let repositories: ReturnType<typeof createRepositories> | ReturnType<typeof createSqliteRepositories>;
  try {
    if (isDatabaseConfigured()) {
      if (!auth.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const db = getDatabase();
      ensureDatabaseSchema(db);
      repositories = createSqliteRepositories(db, auth.user.id);
    } else {
      repositories = createRepositories(resolveDataDir());
    }
  } catch {
    return dataConfigErrorResponse();
  }

  const [context, history] = await Promise.all([
    buildAiWorkspaceContext(repositories),
    "aiChatMessages" in repositories ? repositories.aiChatMessages.listRecent(20) : Promise.resolve([])
  ]);
  const result = await generateAiAssistantReply(config, { userMessage: input.message, context, history });

  if (!result) {
    return Response.json({ ok: false, error: AI_CHAT_FAILED });
  }

  if (!isAiChatOutputSafe(result.reply)) {
    return Response.json({ ok: true, reply: AI_CHAT_BOUNDARY_REPLY, boundary: "unsafe_output" });
  }

  if ("aiChatMessages" in repositories) {
    await repositories.aiChatMessages.add({ role: "user", content: input.message });
    await repositories.aiChatMessages.add({ role: "assistant", content: result.reply });
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
