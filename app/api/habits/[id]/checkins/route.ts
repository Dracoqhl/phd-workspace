import { requireAuth } from "@/lib/api/auth";
import { dataConfigErrorResponse, getHabitRepositories } from "@/lib/api/habits";
import { getHabitBusinessDate } from "@/lib/domain/habits";

interface HabitCheckinRouteContext {
  params: {
    id: string;
  };
}

export async function POST(request: Request, context: HabitCheckinRouteContext): Promise<Response> {
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const repos = getRepositoriesOrResponse();
  if (repos instanceof Response) {
    return repos;
  }

  const habit = await repos.habits.get(context.params.id);
  if (!habit || !habit.isActive) {
    return Response.json({ error: "Habit not found" }, { status: 404 });
  }

  const result = await repos.habitCheckins.complete(context.params.id, getHabitBusinessDate());
  return Response.json({ checkin: result.checkin }, { status: result.created ? 201 : 200 });
}

function getRepositoriesOrResponse(): ReturnType<typeof getHabitRepositories> | Response {
  try {
    return getHabitRepositories();
  } catch {
    return dataConfigErrorResponse();
  }
}
