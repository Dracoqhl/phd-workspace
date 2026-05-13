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
  return Response.json({ ok: true, results });
}
