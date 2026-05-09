import { requireAuth } from "@/lib/api/auth";
import {
  checkInTodayCareRecord,
  dataConfigErrorResponse,
  getCareRepositories,
  INVALID_CARE_PAYLOAD,
  parseCareCheckinInput,
  readJsonObject
} from "@/lib/api/care";

export async function POST(request: Request): Promise<Response> {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await readJsonObject(request);
  const input = body ? parseCareCheckinInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_CARE_PAYLOAD }, { status: 400 });
  }

  let repos: ReturnType<typeof getCareRepositories>;
  try {
    repos = getCareRepositories();
  } catch {
    return dataConfigErrorResponse();
  }

  const care = await checkInTodayCareRecord(repos, input);
  return Response.json({ care });
}
