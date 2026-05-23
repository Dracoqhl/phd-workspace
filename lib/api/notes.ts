import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/api/auth";
import type { UpdateQuickNoteInput } from "@/types/note";

export const INVALID_NOTE_PAYLOAD = "Invalid note payload";
export const NOTES_CONFIG_ERROR = "Notes require database mode";

export function notesConfigErrorResponse(): Response {
  return Response.json({ error: NOTES_CONFIG_ERROR }, { status: 404 });
}

export function getNoteRepositories(auth: AuthContext) {
  if (!isDatabaseConfigured() || !auth.user) {
    throw new Error("Notes require database mode");
  }

  const db = getDatabase();
  ensureDatabaseSchema(db);
  return createSqliteRepositories(db, auth.user.id);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseUpdateQuickNoteInput(body: Record<string, unknown>): UpdateQuickNoteInput | null {
  const input: UpdateQuickNoteInput = {};

  if ("tag" in body) {
    if (typeof body.tag !== "string") return null;
    const tag = body.tag.trim();
    if (tag.length > 4) return null;
    input.tag = tag;
  }

  if ("title" in body) {
    if (typeof body.title !== "string") return null;
    input.title = body.title;
  }

  if ("content" in body) {
    if (typeof body.content !== "string") return null;
    input.content = body.content;
  }

  return input;
}
