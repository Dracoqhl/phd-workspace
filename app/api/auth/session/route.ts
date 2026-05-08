import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from "@/lib/auth/session";

const CONFIG_ERROR_RESPONSE = {
  authenticated: false,
  error: "Auth is not configured"
};

export function GET(request: Request): Response {
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
