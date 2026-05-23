import { requireUser, type AuthContext } from "@/lib/api/auth";
import { getNoteRepositories, notesConfigErrorResponse } from "@/lib/api/notes";

export async function GET(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const notes = await repos.notes.list();
  return Response.json({ notes });
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const note = await repos.notes.create();
  return Response.json({ note }, { status: 201 });
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getNoteRepositories> | Response {
  try {
    return getNoteRepositories(auth);
  } catch {
    return notesConfigErrorResponse();
  }
}
