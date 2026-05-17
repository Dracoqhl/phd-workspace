import { requireUser } from "@/lib/api/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";

export async function GET(request: Request): Promise<Response> {
  const repositories = resolveChatRepositories(request);
  if (repositories instanceof Response) return repositories;

  const messages = await repositories.aiChatMessages.listRecent(50);
  return Response.json({ messages });
}

export async function DELETE(request: Request): Promise<Response> {
  const repositories = resolveChatRepositories(request);
  if (repositories instanceof Response) return repositories;

  await repositories.aiChatMessages.clear();
  return Response.json({ ok: true });
}

function resolveChatRepositories(request: Request): ReturnType<typeof createSqliteRepositories> | Response {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  if (!isDatabaseConfigured() || !auth.user) {
    return Response.json({ messages: [] });
  }

  try {
    const db = getDatabase();
    ensureDatabaseSchema(db);
    return createSqliteRepositories(db, auth.user.id);
  } catch {
    return Response.json({ error: "Data directory is not configured" }, { status: 500 });
  }
}
