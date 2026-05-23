import { requireUser, type AuthContext } from "@/lib/api/auth";
import {
  getNoteRepositories,
  INVALID_NOTE_PAYLOAD,
  notesConfigErrorResponse,
  parseUpdateQuickNoteInput,
  readJsonObject
} from "@/lib/api/notes";

interface NoteRouteContext {
  params: {
    id: string;
  };
}

export async function PATCH(request: Request, context: NoteRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseUpdateQuickNoteInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_NOTE_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const note = await repos.notes.update(context.params.id, input);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  return Response.json({ note });
}

export async function DELETE(request: Request, context: NoteRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const note = await repos.notes.get(context.params.id);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  await repos.notes.delete(context.params.id);
  return Response.json({ deleted: true });
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getNoteRepositories> | Response {
  try {
    return getNoteRepositories(auth);
  } catch {
    return notesConfigErrorResponse();
  }
}
