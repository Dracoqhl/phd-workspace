import { getSessionSecret, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { SessionRepository, toPublicUser } from "@/lib/db/auth-repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import type { PublicUser, User } from "@/types/user";

export interface AuthContext {
  user: User | null;
  publicUser: PublicUser | null;
  legacy: boolean;
}

export function requireAuth(request: Request): Response | null {
  const context = getAuthContext(request);
  return context instanceof Response ? context : null;
}

export function requireUser(request: Request): AuthContext | Response {
  return getAuthContext(request);
}

export function requireAdmin(request: Request): AuthContext | Response {
  const context = getAuthContext(request);
  if (context instanceof Response) {
    return context;
  }

  if (!context.user || context.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return context;
}

export function getAuthContext(request: Request): AuthContext | Response {
  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      ensureDatabaseSchema(db);
      const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
      const user = new SessionRepository(db).findUserByToken(token);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      return { user, publicUser: toPublicUser(user), legacy: false };
    } catch {
      return Response.json({ error: "Auth is not configured" }, { status: 500 });
    }
  }

  let sessionSecret: string;

  try {
    sessionSecret = getSessionSecret();
  } catch {
    return Response.json({ error: "Auth is not configured" }, { status: 500 });
  }

  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!verifySessionToken(token, sessionSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { user: null, publicUser: null, legacy: true };
}

function getCookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  let value: string | undefined;
  for (const cookie of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = cookie.trim().split("=");
    if (cookieName === name) {
      value = valueParts.join("=");
    }
  }

  return value;
}
