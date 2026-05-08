import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export function POST(_request?: Request): Response {
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

function clearSessionCookie(): string {
  return [`${SESSION_COOKIE_NAME}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"].join(
    "; "
  );
}
