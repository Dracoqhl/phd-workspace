import { getSessionSecret, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export function requireAuth(request: Request): Response | null {
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

  return null;
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
