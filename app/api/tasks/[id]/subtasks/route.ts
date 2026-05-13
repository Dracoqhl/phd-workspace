import { requireUser, type AuthContext } from "@/lib/api/auth";
import {
  dataConfigErrorResponse,
  getTaskRepositories,
  INVALID_TASK_PAYLOAD,
  parseCreateTaskInput,
  readJsonObject
} from "@/lib/api/tasks";

interface SubtaskRouteContext {
  params: {
    id: string;
  };
}

export async function POST(request: Request, context: SubtaskRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseCreateTaskInput(body, context.params.id) : null;
  if (!input) {
    return Response.json({ error: INVALID_TASK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) {
    return repos;
  }

  try {
    const task = await repos.tasks.create(input);
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Parent task")) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getTaskRepositories> | Response {
  try {
    return getTaskRepositories(auth);
  } catch {
    return dataConfigErrorResponse();
  }
}
