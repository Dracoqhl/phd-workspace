import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { InviteRepository, SessionRepository, UserRepository, toPublicUser } from "@/lib/db/auth-repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";

const INVALID_REQUEST_RESPONSE = {
  authenticated: false,
  error: "Invalid request"
};

export async function POST(request: Request): Promise<Response> {
  if (!isDatabaseConfigured()) {
    return Response.json({ authenticated: false, error: "Registration is not enabled" }, { status: 404 });
  }

  const body = await readJsonObject(request);
  if (!body) {
    return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

  if (!isValidEmail(email) || password.length < 8 || !inviteCode) {
    return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
  }

  let db;
  try {
    db = getDatabase();
    ensureDatabaseSchema(db);
  } catch {
    return Response.json({ authenticated: false, error: "Auth is not configured" }, { status: 500 });
  }

  const users = new UserRepository(db);
  if (users.findByEmail(email)) {
    return Response.json({ authenticated: false, error: "Email already exists" }, { status: 409 });
  }

  let user;
  try {
    user = new InviteRepository(db).consume(inviteCode, () => users.create({ email, password, role: "user" }));
  } catch {
    return Response.json({ authenticated: false, error: "Email already exists" }, { status: 409 });
  }

  if (!user) {
    return Response.json({ authenticated: false, error: "Invalid invite code" }, { status: 400 });
  }

  const session = new SessionRepository(db).create(user.id);
  return Response.json(
    { authenticated: true, user: toPublicUser(user) },
    {
      status: 201,
      headers: {
        "Set-Cookie": serializeSessionCookie(session.token)
      }
    }
  );
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const email = formData.get("email");
      const password = formData.get("password");
      const inviteCode = formData.get("inviteCode");
      return {
        email: typeof email === "string" ? email : "",
        password: typeof password === "string" ? password : "",
        inviteCode: typeof inviteCode === "string" ? inviteCode : ""
      };
    }

    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
