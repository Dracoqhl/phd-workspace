import { requireUser } from "@/lib/api/auth";
import {
  checkInTodayCareRecord,
  dataConfigErrorResponse,
  getCareRepositories,
  INVALID_CARE_PAYLOAD,
  parseCareCheckinInput,
  readJsonObject
} from "@/lib/api/care";

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseCareCheckinInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_CARE_PAYLOAD }, { status: 400 });
  }

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }

  const care = await checkInTodayCareRecord(repos, input);
  return Response.json({ care });
}
