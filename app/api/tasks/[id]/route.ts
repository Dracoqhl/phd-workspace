import { requireUser, type AuthContext } from "@/lib/api/auth";
import {
  dataConfigErrorResponse,
  getTaskRepositories,
  INVALID_TASK_PAYLOAD,
  parseUpdateTaskInput,
  readJsonObject
} from "@/lib/api/tasks";

interface TaskRouteContext {
  params: {
    id: string;
  };
}

export async function GET(request: Request, context: TaskRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) {
    return repos;
  }
  const task = await repos.tasks.get(context.params.id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({ task });
}

export async function PATCH(request: Request, context: TaskRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseUpdateTaskInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_TASK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) {
    return repos;
  }
  const task = await repos.tasks.update(context.params.id, input);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({ task });
}

export async function DELETE(request: Request, context: TaskRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) {
    return repos;
  }
  const task = await repos.tasks.get(context.params.id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  await repos.tasks.delete(context.params.id);
  return Response.json({ deleted: true });
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getTaskRepositories> | Response {
  try {
    return getTaskRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }
}
