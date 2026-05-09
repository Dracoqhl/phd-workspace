import { LoginForm } from "@/app/login-form";
import { CarePanel } from "@/components/care/CarePanel";
import { HabitManager } from "@/components/habits/HabitManager";
import { TaskManager } from "@/components/tasks/TaskManager";
import { getHabitBusinessDate } from "@/lib/domain/habits";

interface WorkspacePageContentProps {
  authenticated: boolean;
}

export function WorkspacePageContent({ authenticated }: WorkspacePageContentProps) {
  const businessDate = getHabitBusinessDate();

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
              <span className="w-fit rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
                {businessDate}
              </span>
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
  return (
    <aside
      aria-label="AI 助手"
      className="min-h-48 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:w-[30%]"
    >
      <h2 className="text-base font-semibold text-ink">AI 助手</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        右侧常驻助手会在后续阶段接入 API 测试、聊天、任务拆解和确认卡片。
      </p>
    </aside>
  );
}
