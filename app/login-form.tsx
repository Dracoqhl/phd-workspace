"use client";

import { FormEvent, useState } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorId = "access-password-error";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        const body = await parseErrorResponse(response);
        setError(body?.error === "Invalid password" ? "Invalid password" : "Unable to log in");
        return;
      }

      window.location.reload();
    } catch {
      setError("Unable to log in");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-6 flex w-full max-w-sm flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink" htmlFor="access-password">
          Access password
        </label>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? "true" : undefined}
          autoComplete="current-password"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-ink outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          disabled={isSubmitting}
          id="access-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </div>

      {error ? (
        <p className="text-sm font-medium text-red-700" id={errorId} role="alert">
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
