import { getCareDate } from "@/lib/domain/care";
import { getHabitBusinessDate } from "@/lib/domain/habits";
import type { createRepositories } from "@/lib/data/repositories";
import type { createSqliteRepositories } from "@/lib/db/repositories";
import type { AiAssistantContext } from "@/lib/ai/chat";

export const INVALID_AI_CHAT_PAYLOAD = "Invalid AI chat payload";
export const AI_CHAT_FAILED = "AI chat failed";
export const DATA_DIR_CONFIG_ERROR = "Data directory is not configured";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_HABITS = 20;

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
