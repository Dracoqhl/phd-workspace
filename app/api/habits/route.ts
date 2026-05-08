import { requireAuth } from "@/lib/api/auth";
import {
  dataConfigErrorResponse,
  getHabitRepositories,
  INVALID_HABIT_PAYLOAD,
  listActiveHabitsForToday,
  parseCreateHabitInput,
  readJsonObject
} from "@/lib/api/habits";

export async function GET(request: Request): Promise<Response> {
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const repos = getRepositoriesOrResponse();
  if (repos instanceof Response) {
    return repos;
  }

  return Response.json(await listActiveHabitsForToday(repos));
}

export async function POST(request: Request): Promise<Response> {
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const body = await readJsonObject(request);
  const input = body ? parseCreateHabitInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_HABIT_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse();
  if (repos instanceof Response) {
    return repos;
  }

  const habit = await repos.habits.create(input);
  return Response.json({ habit }, { status: 201 });
}

function getRepositoriesOrResponse(): ReturnType<typeof getHabitRepositories> | Response {
  try {
    return getHabitRepositories();
  } catch {
    return dataConfigErrorResponse();
  }
}
