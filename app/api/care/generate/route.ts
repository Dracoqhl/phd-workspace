import { requireAuth } from "@/lib/api/auth";
import { dataConfigErrorResponse, getCareRepositories, refreshTodayCareRecord } from "@/lib/api/care";

export async function POST(request: Request): Promise<Response> {
  const authError = requireAuth(request);
  if (authError) return authError;

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories();
  } catch {
    return dataConfigErrorResponse();
  }

  const care = await refreshTodayCareRecord(repos);
  return Response.json({ care });
}
