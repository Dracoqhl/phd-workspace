import { requireUser, type AuthContext } from "@/lib/api/auth";
import {
  dataConfigErrorResponse,
  getHabitRepositories,
  INVALID_HABIT_PAYLOAD,
  parseUpdateHabitInput,
  readJsonObject
} from "@/lib/api/habits";

interface HabitRouteContext {
  params: {
    id: string;
  };
}

export async function PATCH(request: Request, context: HabitRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseUpdateHabitInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_HABIT_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) {
    return repos;
  }

  const habit = await repos.habits.update(context.params.id, input);
  if (!habit) {
    return Response.json({ error: "Habit not found" }, { status: 404 });
  }

  return Response.json({ habit });
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getHabitRepositories> | Response {
  try {
    return getHabitRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }
}
