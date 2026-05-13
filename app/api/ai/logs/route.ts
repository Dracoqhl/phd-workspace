import { requireUser } from "@/lib/api/auth";
import { dataConfigErrorResponse } from "@/lib/api/ai-actions";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";

export async function GET(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

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

  const logs = await repositories.aiLogs.list();
  return Response.json({ logs });
}
