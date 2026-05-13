import { requireUser } from "@/lib/api/auth";
import { dataConfigErrorResponse, getCareRepositories, refreshTodayCareRecord } from "@/lib/api/care";

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }

  const care = await refreshTodayCareRecord(repos);
  return Response.json({ care });
}
