"use client";

import { FormEvent, useState } from "react";

interface LoginFormProps {
  initialMode?: "login" | "register";
  multiUserEnabled?: boolean;
}

const fieldControlClass = "border-field-border bg-field text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20 disabled:opacity-60";

export function LoginForm({ initialMode = "login", multiUserEnabled = false }: LoginFormProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorId = multiUserEnabled ? "login-error" : "access-password-error";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsSubmitting(true);

    try {
      const endpoint = multiUserEnabled && mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(multiUserEnabled ? { email, password, inviteCode } : { password })
      });

      if (!response.ok) {
        const body = await parseErrorResponse(response);
        setError(normalizeAuthError(body?.error, mode));
        return;
      }

      window.location.reload();
    } catch {
      setError("Unable to log in");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (multiUserEnabled) {
    return (
      <form action={mode === "register" ? "/api/auth/register" : "/api/auth/login"} className="mt-6 flex w-full max-w-sm flex-col gap-4" method="post" onSubmit={handleSubmit}>
        <div className="flex rounded-md border border-slate-200 bg-white p-1">
          <a
            className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold ${mode === "login" ? "bg-moss text-white" : "text-slate-600"}`}
            href="?mode=login"
            onClick={(event) => {
              event.preventDefault();
              setMode("login");
              setError(null);
            }}
          >
            Log In
          </a>
          <a
            className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold ${mode === "register" ? "bg-moss text-white" : "text-slate-600"}`}
            href="?mode=register"
            onClick={(event) => {
              event.preventDefault();
              setMode("register");
              setError(null);
            }}
          >
            Register
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-ink" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className={`rounded-md border px-3 py-2 text-base ${fieldControlClass}`}
            disabled={isSubmitting}
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-ink" htmlFor="password">
            Password
          </label>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? "true" : undefined}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className={`rounded-md border px-3 py-2 text-base ${fieldControlClass}`}
            disabled={isSubmitting}
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </div>

        {mode === "register" ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink" htmlFor="invite-code">
              Invite code
            </label>
            <input
              className={`rounded-md border px-3 py-2 text-base ${fieldControlClass}`}
              disabled={isSubmitting}
              id="invite-code"
              name="inviteCode"
              onChange={(event) => setInviteCode(event.target.value)}
              type="text"
              value={inviteCode}
            />
          </div>
        ) : null}

        {error ? (
          <p className="text-sm font-medium text-danger-text" id={errorId} role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Working" : mode === "register" ? "Create Account" : "Log In"}
        </button>
      </form>
    );
  }

  return (
    <form action="/api/auth/login" className="mt-6 flex w-full max-w-sm flex-col gap-4" method="post" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink" htmlFor="access-password">
          Access password
        </label>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? "true" : undefined}
          autoComplete="current-password"
          className={`rounded-md border px-3 py-2 text-base ${fieldControlClass}`}
          disabled={isSubmitting}
          id="access-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </div>

      {error ? (
        <p className="text-sm font-medium text-danger-text" id={errorId} role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Logging In" : "Log In"}
      </button>
    </form>
  );
}

function normalizeAuthError(error: string | undefined, mode: "login" | "register"): string {
  if (error === "Invalid password") return "Invalid password";
  if (error === "Invalid credentials") return "Invalid credentials";
  if (error === "Invalid invite code") return "Invalid invite code";
  if (error === "Invalid email") return "Invalid email";
  if (error === "Password must be at least 8 characters") return "Password must be at least 8 characters";
  if (error === "Invite code is required") return "Invite code is required";
  if (error === "Email already exists") return "Email already exists";
  return mode === "register" ? "Unable to register" : "Unable to log in";
}

async function parseErrorResponse(response: Response): Promise<{ error?: string } | undefined> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as { error?: string };
    }
  } catch {
    return undefined;
  }

  return undefined;
}
