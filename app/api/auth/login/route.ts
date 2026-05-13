import { getConfiguredPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  getSessionSecret,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/lib/auth/session";
import { SessionRepository, UserRepository, toPublicUser } from "@/lib/db/auth-repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";

const CONFIG_ERROR_RESPONSE = {
  authenticated: false,
  error: "Auth is not configured"
};

const INVALID_REQUEST_RESPONSE = {
  authenticated: false,
  error: "Invalid request"
};

export async function POST(request: Request): Promise<Response> {
  if (isDatabaseConfigured()) {
    return loginWithDatabase(request);
  }

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

async function loginWithDatabase(request: Request): Promise<Response> {
  const body = await parseRequestBody(request);
  if (body === "malformed") {
    return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  let db;
  try {
    db = getDatabase();
    ensureDatabaseSchema(db);
  } catch {
    return Response.json(CONFIG_ERROR_RESPONSE, { status: 500 });
  }

  const user = new UserRepository(db).verifyCredentials(email, password);
  if (!user) {
    return Response.json(
      {
        authenticated: false,
        error: "Invalid credentials"
      },
      { status: 401 }
    );
  }

  const session = new SessionRepository(db).create(user.id);
  const cookie = serializeSessionCookie(session.token);

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
    { authenticated: true, user: toPublicUser(user) },
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
      const email = formData.get("email");
      const password = formData.get("password");
      return {
        email: typeof email === "string" ? email : "",
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
