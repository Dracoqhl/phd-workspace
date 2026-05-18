"use client";

import { Check, Clipboard, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface AdminOverview {
  stats: {
    users: number;
    invites: number;
    usedInvites: number;
    unusedInvites: number;
    tasks: number;
    habits: number;
  };
  invites: AdminInvite[];
  users: AdminUser[];
}

interface AdminInvite {
  id: string;
  code: string;
  status: "used" | "unused";
  consumedByUserId: string | null;
  consumedByEmail: string | null;
  createdAt: string;
}

interface AdminUser {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  tasksCount: number;
  habitsCount: number;
}

const emptyOverview: AdminOverview = {
  stats: {
    users: 0,
    invites: 0,
    usedInvites: 0,
    unusedInvites: 0,
    tasks: 0,
    habits: 0
  },
  invites: [],
  users: []
};

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    void loadOverview();
  }, []);

  const stats = useMemo(
    () => [
      { label: "Users", value: overview.stats.users },
      { label: "Invites", value: overview.stats.invites },
      { label: "Unused", value: overview.stats.unusedInvites },
      { label: "Used", value: overview.stats.usedInvites },
      { label: "Tasks", value: overview.stats.tasks },
      { label: "Habits", value: overview.stats.habits }
    ],
    [overview.stats]
  );

  async function loadOverview() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/overview");
      if (!response.ok) {
        throw new Error("Unable to load admin overview");
      }

      setOverview((await response.json()) as AdminOverview);
    } catch {
      setError("Unable to load admin overview");
    } finally {
      setLoading(false);
    }
  }

  async function createInvite() {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/invites", { method: "POST" });
      if (!response.ok) {
        throw new Error("Unable to create invite");
      }

      const body = (await response.json()) as { invite: Omit<AdminInvite, "status" | "consumedByEmail"> & Partial<AdminInvite> };
      const invite: AdminInvite = {
        ...body.invite,
        status: body.invite.consumedByUserId ? "used" : "unused",
        consumedByEmail: body.invite.consumedByEmail ?? null
      };

      setOverview((current) => ({
        ...current,
        stats: {
          ...current.stats,
          invites: current.stats.invites + 1,
          unusedInvites: current.stats.unusedInvites + 1
        },
        invites: [invite, ...current.invites]
      }));
    } catch {
      setError("Unable to create invite");
    } finally {
      setCreating(false);
    }
  }

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard?.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => {
        setCopiedCode((current) => (current === code ? null : current));
      }, 1600);
    } catch {
      setError("Unable to copy invite code");
    }
  }

  return (
    <section aria-label="管理员工作台" className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Admin Dashboard</h2>
            <p className="mt-1 text-sm text-slate-500">Manage one-time invites and monitor workspace usage.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Refresh admin overview"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              disabled={loading}
              onClick={loadOverview}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
              disabled={creating}
              onClick={createInvite}
              type="button"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {creating ? "Creating" : "New Invite"}
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {stats.map((stat) => (
            <div
              aria-label={`${stat.label}: ${stat.value}`}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3"
              key={stat.label}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section aria-label="Invite codes" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Invite Codes</h3>
              <p className="mt-1 text-xs text-slate-500">Each code can register one account.</p>
            </div>
            {loading ? <span className="text-xs font-medium text-slate-400">Loading</span> : null}
          </div>

          <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
            {overview.invites.length > 0 ? (
              <div className="divide-y divide-slate-200">
                {overview.invites.map((invite) => (
                  <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_110px_120px]" key={invite.id}>
                    <div className="min-w-0">
                      <code className="block truncate text-sm font-semibold text-ink">{invite.code}</code>
                      <p className="mt-1 text-xs text-slate-500">
                        {invite.status === "used" ? invite.consumedByEmail ?? "Used" : "Unused"} · {formatDate(invite.createdAt)}
                      </p>
                    </div>
                    <span
                      className={
                        invite.status === "used"
                          ? "h-fit w-fit rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"
                          : "h-fit w-fit rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                      }
                    >
                      {invite.status === "used" ? "Used" : "Unused"}
                    </span>
                    <button
                      aria-label={`Copy ${invite.code}`}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                      onClick={() => copyInvite(invite.code)}
                      type="button"
                    >
                      {copiedCode === invite.code ? (
                        <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Clipboard aria-hidden="true" className="h-3.5 w-3.5" />
                      )}
                      {copiedCode === invite.code ? "Copied" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No invite codes yet.</p>
            )}
          </div>
        </section>

        <section aria-label="Users" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Users</h3>
              <p className="mt-1 text-xs text-slate-500">Registered accounts and content counts.</p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
            {overview.users.length > 0 ? (
              <div className="divide-y divide-slate-200">
                {overview.users.map((user) => (
                  <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]" key={user.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{user.email}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {user.role} · joined {formatDate(user.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <span>{user.tasksCount} tasks</span>
                      <span>{user.habitsCount} habits</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No users yet.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
