import { getCareDate } from "@/lib/domain/care";
import { getHabitBusinessDate } from "@/lib/domain/habits";
import type { createRepositories } from "@/lib/data/repositories";
import type { createSqliteRepositories } from "@/lib/db/repositories";
import type { AiAssistantContext } from "@/lib/ai/chat";

export const INVALID_AI_CHAT_PAYLOAD = "Invalid AI chat payload";
export const AI_CHAT_FAILED = "AI chat failed";
export const DATA_DIR_CONFIG_ERROR = "Data directory is not configured";
export const AI_CHAT_BOUNDARY_REPLY =
  "我只能帮助维护当前工作台中的任务、习惯、今日计划和 Quote 设置。这个请求不在当前 AI 助手的使用范围内。";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_HABITS = 20;
const WORKSPACE_INTENT_PATTERNS = [
  /任务/,
  /子任务/,
  /习惯/,
  /打卡/,
  /今日|今天/,
  /计划|安排/,
  /quote|金句/i,
  /心灵|关怀/,
  /能量|focus/i,
  /项目|学习|阅读|写作|复盘|记录/,
  /ddl|截止|优先级|状态/i,
  /工作台/,
  /拆解|梳理|整理/,
  /添加|新增|创建|删除|修改/,
  /对话|历史|消息|回复/
];
const UNSAFE_INPUT_PATTERNS = [
  /api\s*key|apikey|api_key/i,
  /secret|token|session|cookie/i,
  /密码|密钥|环境变量|\.env/i,
  /系统提示|system\s*prompt|developer\s*message/i,
  /数据库路径|服务器配置|文件系统/i,
  /绕过权限|越权|破解|攻击服务器|ddos|木马/i,
  /色情|黄色|裸聊|赌博|毒品|炸弹/i
];
const UNSAFE_OUTPUT_PATTERNS = [
  /api\s*key|apikey|api_key/i,
  /secret|token|session|cookie/i,
  /环境变量|\.env/i,
  /系统提示|system\s*prompt|developer\s*message/i,
  /数据库路径|服务器配置|文件系统/i,
  /绕过权限|越权|破解|攻击服务器|ddos/i
];

type Repositories = ReturnType<typeof createRepositories> | ReturnType<typeof createSqliteRepositories>;

export function dataConfigErrorResponse(): Response {
  return Response.json({ error: DATA_DIR_CONFIG_ERROR }, { status: 500 });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export function parseAiChatInput(body: Record<string, unknown>): { message: string } | null {
  if (typeof body.message !== "string") {
    return null;
  }

  const message = body.message.trim();
  if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return null;
  }

  return { message };
}

export function isAiChatInputInScope(message: string): boolean {
  const normalized = message.trim();
  if (UNSAFE_INPUT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return WORKSPACE_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isAiChatOutputSafe(reply: string): boolean {
  return !UNSAFE_OUTPUT_PATTERNS.some((pattern) => pattern.test(reply));
}

export async function buildAiWorkspaceContext(repositories: Repositories): Promise<AiAssistantContext> {
  const today = getCareDate();
  const habitDate = getHabitBusinessDate();
  const [tasks, habits, habitCheckins, care] = await Promise.all([
    repositories.tasks.list(),
    repositories.habits.list(),
    repositories.habitCheckins.list(),
    repositories.careRecords.getByDate(today)
  ]);

  const checkinsByHabitId = new Map(
    habitCheckins.filter((checkin) => checkin.date === habitDate).map((checkin) => [checkin.habitId, checkin])
  );

  return {
    today,
    tasks: tasks
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        parentTaskId: task.parentTaskId,
        completedAt: task.completedAt
      })),
    habits: habits
      .filter((habit) => habit.isActive)
      .slice(0, MAX_CONTEXT_HABITS)
      .map((habit) => {
        const checkin = checkinsByHabitId.get(habit.id);
        return {
          name: habit.name,
          targetCount: habit.targetCount,
          completedCount: checkin?.completedCount ?? 0,
          isCompleted: checkin?.isCompleted ?? false
        };
      }),
    care: care
      ? {
          content: care.content,
          energyLevel: care.energyLevel,
          focusText: care.focusText
        }
      : null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
