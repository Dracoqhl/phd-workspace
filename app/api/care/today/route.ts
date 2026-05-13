import { requireUser } from "@/lib/api/auth";
import { dataConfigErrorResponse, ensureTodayCareRecord, getCareRepositories } from "@/lib/api/care";

export async function GET(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }

  const care = await ensureTodayCareRecord(repos);
  return Response.json({ care });
}
