import { requireUser, type AuthContext } from "@/lib/api/auth";
import { dataConfigErrorResponse, getHabitRepositories } from "@/lib/api/habits";
import { getHabitBusinessDate } from "@/lib/domain/habits";

interface HabitCheckinRouteContext {
  params: {
    id: string;
  };
}

export async function POST(request: Request, context: HabitCheckinRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) {
    return repos;
  }

  const habit = await repos.habits.get(context.params.id);
  if (!habit || !habit.isActive) {
    return Response.json({ error: "Habit not found" }, { status: 404 });
  }

  const result = await repos.habitCheckins.complete(context.params.id, getHabitBusinessDate(), habit.targetCount);
  return Response.json({ checkin: result.checkin }, { status: result.created ? 201 : 200 });
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getHabitRepositories> | Response {
  try {
    return getHabitRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }
}
