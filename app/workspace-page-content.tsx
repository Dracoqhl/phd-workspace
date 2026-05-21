import { ExternalLink, Github } from "lucide-react";

import { LoginForm } from "@/app/login-form";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AiAssistantPanel } from "@/components/assistant/AiAssistantPanel";
import { CarePanel } from "@/components/care/CarePanel";
import { HabitManager } from "@/components/habits/HabitManager";
import { QuickNotesPanel } from "@/components/notes/QuickNotesPanel";
import { SyncStatusBadge, SyncStatusProvider } from "@/components/sync/SyncStatusProvider";
import { ThemeProvider, ThemeSelect } from "@/components/theme/ThemeProvider";
import { TaskManager } from "@/components/tasks/TaskManager";
import { getHabitBusinessDate } from "@/lib/domain/habits";
import type { PublicUser } from "@/types/user";

const REPOSITORY_URL = "https://github.com/Dracoqhl/phd-workspace";
const REPOSITORY_LABEL = "Dracoqhl/phd-workspace";

interface WorkspacePageContentProps {
  authenticated: boolean;
  initialAuthMode?: "login" | "register";
  multiUserEnabled?: boolean;
  user?: PublicUser | null;
}

export function WorkspacePageContent({ authenticated, initialAuthMode = "login", multiUserEnabled = false, user = null }: WorkspacePageContentProps) {
  const businessDate = getHabitBusinessDate();

  if (authenticated) {
    return (
      <ThemeProvider>
        <SyncStatusProvider>
          <WorkspaceShell authenticated={true} businessDate={businessDate} multiUserEnabled={multiUserEnabled} user={user} />
        </SyncStatusProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <WorkspaceShell
        authenticated={false}
        businessDate={businessDate}
        initialAuthMode={initialAuthMode}
        multiUserEnabled={multiUserEnabled}
        user={user}
      />
    </ThemeProvider>
  );
}

function WorkspaceShell({
  authenticated,
  businessDate,
  initialAuthMode = "login",
  multiUserEnabled = false,
  user = null
}: WorkspacePageContentProps & { businessDate: string }) {
  const isAdmin = authenticated && user?.role === "admin";

  return (
    <main className="min-h-screen bg-paper text-ink">
      <RepositoryBar />
      <div
        className={
          isAdmin
            ? "mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8"
            : "mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8"
        }
      >
        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="border-b border-slate-200 pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-moss">PhD Workspace</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">博士工作台</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  管理科研任务、每日习惯、心灵关怀和 AI 辅助整理的个人工作台。
                </p>
              </div>
              <div aria-label="Workspace status" className="flex shrink-0 flex-wrap items-center gap-2">
                <ThemeSelect />
                {authenticated ? <SyncStatusBadge /> : null}
                <span className="w-fit rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
                  {businessDate}
                </span>
                {isAdmin && user ? <AccountControls user={user} variant="compact" /> : null}
              </div>
            </div>
          </header>

          {isAdmin ? (
            <AdminDashboard />
          ) : authenticated ? (
            <WorkspaceSections />
          ) : (
            <LoginForm initialMode={initialAuthMode} multiUserEnabled={multiUserEnabled} />
          )}
        </section>

        {authenticated && !isAdmin ? <AiAssistantAside user={user} /> : null}
      </div>
    </main>
  );
}

function RepositoryBar() {
  return (
    <div className="border-b border-line bg-surface/85">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-1 text-[11px] leading-5 text-muted lg:px-8">
        <span className="font-medium text-primary">Source</span>
        <a
          aria-label={`Open GitHub repository ${REPOSITORY_LABEL}`}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-muted transition hover:bg-surface-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-accent/35"
          href={REPOSITORY_URL}
          rel="noreferrer"
          target="_blank"
        >
          <Github aria-hidden="true" size={13} />
          <span className="truncate">{REPOSITORY_LABEL}</span>
          <ExternalLink aria-hidden="true" size={12} />
        </a>
      </div>
    </div>
  );
}

function WorkspaceSections() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <CarePanel />
        <HabitManager />
      </div>
      <TaskManager />
      <QuickNotesPanel />
    </div>
  );
}

function AiAssistantAside({ user }: { user: PublicUser | null }) {
  return (
    <aside className="flex min-h-48 flex-col gap-3 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-[30%] lg:self-start">
      {user ? <AccountControls user={user} variant="panel" /> : null}
      <AiAssistantPanel />
    </aside>
  );
}

function AccountControls({ user, variant }: { user: PublicUser; variant: "compact" | "panel" }) {
  return (
    <div
      aria-label="Account controls"
      className={
        variant === "compact"
          ? "flex items-center gap-3 rounded-md bg-white px-3 py-1.5 text-sm shadow-sm ring-1 ring-slate-200"
          : "flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
      }
    >
      <div className="min-w-0">
        <p className={variant === "compact" ? "max-w-48 truncate text-sm font-semibold text-ink" : "truncate text-sm font-semibold text-ink"}>
          {user.email}
        </p>
        {variant === "panel" ? <p className="mt-0.5 text-xs capitalize text-slate-500">{user.role}</p> : null}
      </div>
      <form action="/api/auth/logout" method="post">
        <button
          className={
            variant === "compact"
              ? "rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              : "rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          }
          type="submit"
        >
          Logout
        </button>
      </form>
    </div>
  );
}
