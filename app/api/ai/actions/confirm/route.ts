import { requireUser } from "@/lib/api/auth";
import {
  INVALID_AI_ACTION_PAYLOAD,
  applyAiActionInput,
  dataConfigErrorResponse,
  parseAiActionConfirmInput,
  readJsonObject
} from "@/lib/api/ai-actions";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseAiActionConfirmInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_AI_ACTION_PAYLOAD }, { status: 400 });
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

  const results = await applyAiActionInput(repositories, input);
  if ("aiChatMessages" in repositories && "markLatestProposalHandled" in repositories.aiChatMessages) {
    const executedCount = results.filter((result) => result.status === "confirmed_executed").length;
    const failedCount = results.filter((result) => result.status === "failed").length;
    const actionState = input.decision === "reject" ? "rejected" : failedCount > 0 ? "failed" : "executed";
    const actionStatus =
      input.decision === "reject"
        ? "已取消这些建议。"
        : failedCount > 0
          ? `已执行 ${executedCount} 项，${failedCount} 项失败。`
          : `已执行 ${executedCount} 项建议。`;
    await repositories.aiChatMessages.markLatestProposalHandled(
      input.proposals.map((proposal) => proposal.id),
      actionState,
      actionStatus
    );
  }
  return Response.json({ ok: true, results });
}
