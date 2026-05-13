import { requireAuth } from "@/lib/api/auth";
import {
  INVALID_AI_ACTION_PAYLOAD,
  applyAiActionInput,
  dataConfigErrorResponse,
  parseAiActionConfirmInput,
  readJsonObject
} from "@/lib/api/ai-actions";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";

export async function POST(request: Request): Promise<Response> {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await readJsonObject(request);
  const input = body ? parseAiActionConfirmInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_AI_ACTION_PAYLOAD }, { status: 400 });
  }

  let repositories: ReturnType<typeof createRepositories>;
  try {
    repositories = createRepositories(resolveDataDir());
  } catch {
    return dataConfigErrorResponse();
  }

  const results = await applyAiActionInput(repositories, input);
  return Response.json({ ok: true, results });
}
