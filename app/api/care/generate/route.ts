import { requireUser } from "@/lib/api/auth";
import { dataConfigErrorResponse, getCareRepositories, parseCareGenerateInput, readJsonObject, refreshTodayCareRecord } from "@/lib/api/care";

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }

  const body = await readJsonObject(request);
  const careState = await refreshTodayCareRecord(repos, parseCareGenerateInput(body));
  return Response.json(careState);
}
