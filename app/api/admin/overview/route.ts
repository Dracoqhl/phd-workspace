import { requireAdmin } from "@/lib/api/auth";
import { AdminOverviewRepository } from "@/lib/db/auth-repositories";
import { getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";

export function GET(request: Request): Response {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const db = getDatabase();
  ensureDatabaseSchema(db);
  return Response.json(new AdminOverviewRepository(db).get());
}
