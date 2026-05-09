import { requireAuth } from "@/lib/api/auth";
import { dataConfigErrorResponse, ensureTodayCareRecord, getCareRepositories } from "@/lib/api/care";

export async function GET(request: Request): Promise<Response> {
  const authError = requireAuth(request);
  if (authError) return authError;

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories();
  } catch {
    return dataConfigErrorResponse();
  }

  const care = await ensureTodayCareRecord(repos);
  return Response.json({ care });
}
