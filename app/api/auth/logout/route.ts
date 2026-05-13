import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { SessionRepository } from "@/lib/db/auth-repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";

export function POST(request: Request): Response {
  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      ensureDatabaseSchema(db);
      const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
      new SessionRepository(db).deleteByToken(token);
    } catch {
      // Clearing the browser cookie still logs the current client out.
    }
  }

  return Response.json(
    { authenticated: false },
    {
      status: 200,
      headers: {
        "Set-Cookie": clearSessionCookie()
      }
    }
  );
}

export function GET(request: Request): Response {
  return POST(request);
}

function clearSessionCookie(): string {
  return [`${SESSION_COOKIE_NAME}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"].join(
    "; "
  );
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
