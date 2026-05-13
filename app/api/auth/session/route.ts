import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from "@/lib/auth/session";
import { SessionRepository, toPublicUser } from "@/lib/db/auth-repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";

const CONFIG_ERROR_RESPONSE = {
  authenticated: false,
  error: "Auth is not configured"
};

export function GET(request: Request): Response {
  if (isDatabaseConfigured()) {
    return databaseSessionResponse(request);
  }

  let sessionSecret: string;

  try {
    sessionSecret = getSessionSecret();
  } catch {
    return sessionResponse(CONFIG_ERROR_RESPONSE, 500);
  }

  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const authenticated = verifySessionToken(token, sessionSecret);

  return sessionResponse({ authenticated }, 200);
}

function databaseSessionResponse(request: Request): Response {
  try {
    const db = getDatabase();
    ensureDatabaseSchema(db);
    const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
    const user = new SessionRepository(db).findUserByToken(token);

    return sessionResponse(
      user
        ? {
            authenticated: true,
            user: toPublicUser(user)
          }
        : { authenticated: false },
      200
    );
  } catch {
    return sessionResponse(CONFIG_ERROR_RESPONSE, 500);
  }
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

function sessionResponse(body: object, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Vary: "Cookie"
    }
  });
}
