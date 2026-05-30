import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import { limitQuickLinkName, parseQuickLinkUrl } from "@/lib/domain/quick-links";
import type { AuthContext } from "@/lib/api/auth";
import type { CreateQuickLinkInput, UpdateQuickLinkGroupInput, UpdateQuickLinkInput } from "@/types/quick-link";

export const INVALID_QUICK_LINK_PAYLOAD = "Invalid quick link payload";
export const QUICK_LINKS_CONFIG_ERROR = "Quick links require database mode";

export function quickLinksConfigErrorResponse(): Response {
  return Response.json({ error: QUICK_LINKS_CONFIG_ERROR }, { status: 404 });
}

export function getQuickLinkRepositories(auth: AuthContext) {
  if (!isDatabaseConfigured() || !auth.user) {
    throw new Error("Quick links require database mode");
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

export function parseCreateQuickLinkInput(body: Record<string, unknown>): CreateQuickLinkInput | null {
  if (typeof body.url !== "string" || !parseQuickLinkUrl(body.url)) return null;
  if ("title" in body && typeof body.title !== "string") return null;

  const title = typeof body.title === "string" ? limitQuickLinkName(body.title) : undefined;
  return { url: body.url, ...(title ? { title } : {}) };
}

export function parseUpdateQuickLinkGroupInput(body: Record<string, unknown>): UpdateQuickLinkGroupInput | null {
  if (typeof body.displayName !== "string") return null;
  const displayName = limitQuickLinkName(body.displayName);
  if (!displayName) return null;
  return { displayName };
}

export function parseUpdateQuickLinkInput(body: Record<string, unknown>): UpdateQuickLinkInput | null {
  const input: UpdateQuickLinkInput = {};

  if ("title" in body) {
    if (typeof body.title !== "string") return null;
    const title = limitQuickLinkName(body.title);
    if (!title) return null;
    input.title = title;
  }

  if ("url" in body) {
    if (typeof body.url !== "string" || !parseQuickLinkUrl(body.url)) return null;
    input.url = body.url;
  }

  return Object.keys(input).length > 0 ? input : null;
}
