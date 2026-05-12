import { LoginForm } from "@/app/login-form";
import { AiAssistantPanel } from "@/components/assistant/AiAssistantPanel";
import { CarePanel } from "@/components/care/CarePanel";
import { HabitManager } from "@/components/habits/HabitManager";
import { SyncStatusBadge, SyncStatusProvider } from "@/components/sync/SyncStatusProvider";
import { TaskManager } from "@/components/tasks/TaskManager";
import { getHabitBusinessDate } from "@/lib/domain/habits";

interface WorkspacePageContentProps {
  authenticated: boolean;
}

export function WorkspacePageContent({ authenticated }: WorkspacePageContentProps) {
  const businessDate = getHabitBusinessDate();

  if (authenticated) {
    return (
      <SyncStatusProvider>
        <WorkspaceShell authenticated={true} businessDate={businessDate} />
      </SyncStatusProvider>
    );
  }

  return <WorkspaceShell authenticated={false} businessDate={businessDate} />;
}

function WorkspaceShell({ authenticated, businessDate }: WorkspacePageContentProps & { businessDate: string }) {

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
                <span className="w-fit rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
                  {businessDate}
                </span>
              </div>
            </div>
          </header>

          {authenticated ? <WorkspaceSections /> : <LoginForm />}
        </section>

        {authenticated ? <AiAssistantAside /> : null}
      </div>
    </main>
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
    </div>
  );
}

function AiAssistantAside() {
  return <AiAssistantPanel />;
}
