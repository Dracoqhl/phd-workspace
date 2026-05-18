import { requireUser } from "@/lib/api/auth";
import { dataConfigErrorResponse, ensureTodayCareState, getCareRepositories } from "@/lib/api/care";

export async function GET(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }

  const careState = await ensureTodayCareState(repos);
  return Response.json(careState);
}
