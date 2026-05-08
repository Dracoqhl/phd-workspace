import { requireAuth } from "@/lib/api/auth";
import {
  dataConfigErrorResponse,
  getTaskRepositories,
  INVALID_TASK_PAYLOAD,
  parseCreateTaskInput,
  readJsonObject
} from "@/lib/api/tasks";

export async function GET(request: Request): Promise<Response> {
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const repos = getRepositoriesOrResponse();
  if (repos instanceof Response) {
    return repos;
  }
  const tasks = await repos.tasks.list();

  return Response.json({ tasks });
}

export async function POST(request: Request): Promise<Response> {
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const body = await readJsonObject(request);
  const input = body ? parseCreateTaskInput(body, null) : null;
  if (!input) {
    return Response.json({ error: INVALID_TASK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse();
  if (repos instanceof Response) {
    return repos;
  }
  const task = await repos.tasks.create(input);

  return Response.json({ task }, { status: 201 });
}

function getRepositoriesOrResponse(): ReturnType<typeof getTaskRepositories> | Response {
  try {
    return getTaskRepositories();
  } catch {
    return dataConfigErrorResponse();
  }
}
