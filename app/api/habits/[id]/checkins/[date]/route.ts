import { requireAuth } from "@/lib/api/auth";
import { dataConfigErrorResponse, getHabitRepositories } from "@/lib/api/habits";

interface HabitCheckinDateRouteContext {
  params: {
    id: string;
    date: string;
  };
}

export async function DELETE(request: Request, context: HabitCheckinDateRouteContext): Promise<Response> {
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(context.params.date)) {
    return Response.json({ error: "Invalid habit check-in date" }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse();
  if (repos instanceof Response) {
    return repos;
  }

  const habit = await repos.habits.get(context.params.id);
  if (!habit) {
    return Response.json({ error: "Habit not found" }, { status: 404 });
  }

  const checkin = await repos.habitCheckins.decrement(context.params.id, context.params.date, habit.targetCount);
  return Response.json({ checkin, deleted: checkin === null });
}

function getRepositoriesOrResponse(): ReturnType<typeof getHabitRepositories> | Response {
  try {
    return getHabitRepositories();
  } catch {
    return dataConfigErrorResponse();
  }
}
