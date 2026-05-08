import { requireAuth } from "@/lib/api/auth";
import { dataConfigErrorResponse, getHabitRepositories } from "@/lib/api/habits";

interface DeactivateHabitRouteContext {
  params: {
    id: string;
  };
}

export async function PATCH(request: Request, context: DeactivateHabitRouteContext): Promise<Response> {
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const repos = getRepositoriesOrResponse();
  if (repos instanceof Response) {
    return repos;
  }

  const habit = await repos.habits.deactivate(context.params.id);
  if (!habit) {
    return Response.json({ error: "Habit not found" }, { status: 404 });
  }

  return Response.json({ habit });
}

function getRepositoriesOrResponse(): ReturnType<typeof getHabitRepositories> | Response {
  try {
    return getHabitRepositories();
  } catch {
    return dataConfigErrorResponse();
  }
}
