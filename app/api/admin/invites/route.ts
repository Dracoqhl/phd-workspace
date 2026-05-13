import { requireAdmin } from "@/lib/api/auth";
import { InviteRepository } from "@/lib/db/auth-repositories";
import { getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";

export function GET(request: Request): Response {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const db = getDatabase();
  ensureDatabaseSchema(db);
  return Response.json({ invites: new InviteRepository(db).list() });
}

export function POST(request: Request): Response {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;
  if (!auth.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDatabase();
  ensureDatabaseSchema(db);
  const invite = new InviteRepository(db).create(auth.user.id);
  return Response.json({ invite }, { status: 201 });
}
