"use client";

import { useState } from "react";

interface Invite {
  id: string;
  code: string;
  consumedByUserId: string | null;
  createdAt: string;
}

export function InviteManager() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createInvite() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/invites", { method: "POST" });
      if (!response.ok) {
        setError("Unable to create invite");
        return;
      }

      const body = (await response.json()) as { invite: Invite };
      setInvites((items) => [body.invite, ...items]);
    } catch {
      setError("Unable to create invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="邀请码管理" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Invites</h2>
          <p className="mt-1 text-xs text-slate-500">Generate one-time invite codes for beta users.</p>
        </div>
        <button
          className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
          disabled={loading}
          onClick={createInvite}
          type="button"
        >
          {loading ? "Creating" : "New Invite"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}
      {invites.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {invites.map((invite) => (
            <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2" key={invite.id}>
              <code className="text-xs font-semibold text-ink">{invite.code}</code>
              <span className="text-xs text-slate-500">{invite.consumedByUserId ? "Used" : "Unused"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
