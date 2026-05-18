import { requireUser } from "@/lib/api/auth";
import {
  dataConfigErrorResponse,
  getCareRepositories,
  INVALID_CARE_PAYLOAD,
  parseCareUpdateInput,
  readJsonObject,
  updateTodayCareRecord
} from "@/lib/api/care";

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseCareUpdateInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_CARE_PAYLOAD }, { status: 400 });
  }

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }

  const careState = await updateTodayCareRecord(repos, input);
  return Response.json(careState);
}
