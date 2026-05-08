import { LoginForm } from "@/app/login-form";
import { HabitManager } from "@/components/habits/HabitManager";
import { TaskManager } from "@/components/tasks/TaskManager";

const workspaceSections = [
  {
    title: "心灵关怀",
    description: "这里将显示每日关怀内容、刷新按钮、打卡和心情备注。"
  },
  {
    title: "任务管理",
    description: "任务管理模块已连接本地 JSON 任务仓库。"
  }
];

interface WorkspacePageContentProps {
  authenticated: boolean;
}

export function WorkspacePageContent({ authenticated }: WorkspacePageContentProps) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="border-b border-slate-200 pb-5">
            <p className="text-sm font-medium text-moss">PhD Workspace MVP</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">博士工作台</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              当前是最小可运行页面壳，用于确认 Next.js、React、Tailwind 和构建流程已经连通。
            </p>
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
        {workspaceSections.slice(0, 1).map((section) => (
          <section
            aria-label={section.title}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            key={section.title}
          >
            <h2 className="text-base font-semibold text-ink">{section.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{section.description}</p>
          </section>
        ))}
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
