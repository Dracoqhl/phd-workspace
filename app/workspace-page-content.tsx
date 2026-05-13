import { LoginForm } from "@/app/login-form";
import { InviteManager } from "@/components/admin/InviteManager";
import { AiAssistantPanel } from "@/components/assistant/AiAssistantPanel";
import { CarePanel } from "@/components/care/CarePanel";
import { HabitManager } from "@/components/habits/HabitManager";
import { SyncStatusBadge, SyncStatusProvider } from "@/components/sync/SyncStatusProvider";
import { TaskManager } from "@/components/tasks/TaskManager";
import { getHabitBusinessDate } from "@/lib/domain/habits";
import type { PublicUser } from "@/types/user";

interface WorkspacePageContentProps {
  authenticated: boolean;
  multiUserEnabled?: boolean;
  user?: PublicUser | null;
}

export function WorkspacePageContent({ authenticated, multiUserEnabled = false, user = null }: WorkspacePageContentProps) {
  const businessDate = getHabitBusinessDate();

  if (authenticated) {
    return (
      <SyncStatusProvider>
        <WorkspaceShell authenticated={true} businessDate={businessDate} multiUserEnabled={multiUserEnabled} user={user} />
      </SyncStatusProvider>
    );
  }

  return <WorkspaceShell authenticated={false} businessDate={businessDate} multiUserEnabled={multiUserEnabled} user={user} />;
}

function WorkspaceShell({ authenticated, businessDate, multiUserEnabled = false, user = null }: WorkspacePageContentProps & { businessDate: string }) {

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="border-b border-slate-200 pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-moss">PhD Workspace MVP</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">博士工作台</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  当前是最小可运行页面壳，用于确认 Next.js、React、Tailwind 和构建流程已经连通。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {authenticated ? <SyncStatusBadge /> : null}
                {authenticated && user ? (
                  <span className="w-fit rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
                    {user.email}
                  </span>
                ) : null}
                <span className="w-fit rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
                  {businessDate}
                </span>
                {authenticated ? (
                  <form action="/api/auth/logout" method="post">
                    <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300" type="submit">
                      Logout
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </header>

          {authenticated ? <WorkspaceSections user={user} /> : <LoginForm multiUserEnabled={multiUserEnabled} />}
        </section>

        {authenticated ? <AiAssistantAside /> : null}
      </div>
    </main>
  );
}

function WorkspaceSections({ user }: { user: PublicUser | null }) {
  return (
    <div className="grid gap-4">
      {user?.role === "admin" ? <InviteManager /> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <CarePanel />
        <HabitManager />
      </div>
      <TaskManager />
    </div>
  );
}

function AiAssistantAside() {
  return <AiAssistantPanel />;
}
