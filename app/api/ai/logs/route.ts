import { requireAuth } from "@/lib/api/auth";
import { dataConfigErrorResponse } from "@/lib/api/ai-actions";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";

export async function GET(request: Request): Promise<Response> {
  const authError = requireAuth(request);
  if (authError) return authError;

  let repositories: ReturnType<typeof createRepositories>;
  try {
    repositories = createRepositories(resolveDataDir());
  } catch {
    return dataConfigErrorResponse();
  }

  const logs = await repositories.aiLogs.list();
  return Response.json({ logs });
}
