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

  await repos.habitCheckins.delete(context.params.id, context.params.date);
  return Response.json({ deleted: true });
}

function getRepositoriesOrResponse(): ReturnType<typeof getHabitRepositories> | Response {
  try {
    return getHabitRepositories();
  } catch {
    return dataConfigErrorResponse();
  }
}
