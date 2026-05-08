import { getConfiguredPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  getSessionSecret,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/lib/auth/session";

const CONFIG_ERROR_RESPONSE = {
  authenticated: false,
  error: "Auth is not configured"
};

const INVALID_REQUEST_RESPONSE = {
  authenticated: false,
  error: "Invalid request"
};

export async function POST(request: Request): Promise<Response> {
  let configuredPassword: string;
  let sessionSecret: string;

  try {
    configuredPassword = getConfiguredPassword();
    sessionSecret = getSessionSecret();
  } catch {
    return Response.json(CONFIG_ERROR_RESPONSE, { status: 500 });
  }

  const body = await parseRequestBody(request);
  if (body === "malformed") {
    return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
  }

  const password = typeof body?.password === "string" ? body.password : "";

  if (!verifyPassword(password, configuredPassword)) {
    return Response.json(
      {
        authenticated: false,
        error: "Invalid password"
      },
      { status: 401 }
    );
  }

  const token = createSessionToken(sessionSecret);
  const cookie = serializeSessionCookie(token);

  if (body?.source === "native_form") {
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": cookie
      }
    });
  }

  return Response.json(
    { authenticated: true },
    {
      status: 200,
      headers: {
        "Set-Cookie": cookie
      }
    }
  );
}

async function parseRequestBody(
  request: Request
): Promise<Record<string, unknown> | undefined | "malformed"> {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const password = formData.get("password");
      return {
        password: typeof password === "string" ? password : "",
        source: "native_form"
      };
    }

    const body = (await request.json()) as unknown;
    return isRecord(body) ? body : undefined;
  } catch {
    return "malformed";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeSessionCookie(value: string): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ];

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}
