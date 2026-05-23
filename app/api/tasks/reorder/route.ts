import { requireUser, type AuthContext } from "@/lib/api/auth";
import {
  dataConfigErrorResponse,
  getTaskRepositories,
  INVALID_TASK_PAYLOAD,
  parseReorderTasksInput,
  readJsonObject
} from "@/lib/api/tasks";

export async function PATCH(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseReorderTasksInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_TASK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) {
    return repos;
  }

  try {
    const tasks = await repos.tasks.reorder(input.parentTaskId, input.orderedIds);
    return Response.json({ tasks });
  } catch {
    return Response.json({ error: INVALID_TASK_PAYLOAD }, { status: 400 });
  }
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getTaskRepositories> | Response {
  try {
    return getTaskRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }
}
