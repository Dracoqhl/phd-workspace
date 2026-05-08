import { getHabitBusinessDate } from "@/lib/domain/habits";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";
import type { CreateHabitInput, HabitListItem, UpdateHabitInput } from "@/types/habit";

export const INVALID_HABIT_PAYLOAD = "Invalid habit payload";
export const DATA_DIR_CONFIG_ERROR = "Data directory is not configured";

export function dataConfigErrorResponse(): Response {
  return Response.json({ error: DATA_DIR_CONFIG_ERROR }, { status: 500 });
}

export function getHabitRepositories() {
  return createRepositories(resolveDataDir());
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export async function listActiveHabitsForToday(repos: ReturnType<typeof getHabitRepositories>) {
  const date = getHabitBusinessDate();
  const [habits, checkins] = await Promise.all([repos.habits.list(), repos.habitCheckins.list()]);
  const activeHabits = habits.filter((habit) => habit.isActive);
  const items: HabitListItem[] = activeHabits.map((habit) => {
    const checkin = checkins.find((item) => item.habitId === habit.id && item.date === date) ?? null;
    return { habit, checkin, isCompleted: (checkin?.completedCount ?? 0) >= habit.targetCount };
  });

  return { date, habits: items };
}

export function parseCreateHabitInput(body: Record<string, unknown>): CreateHabitInput | null {
  const name = parseRequiredText(body.name);
  if (!name) {
    return null;
  }

  const targetCount = parseTargetCount(body.targetCount, 1);
  if (!targetCount) {
    return null;
  }

  return {
    name,
    description: typeof body.description === "string" ? body.description : "",
    icon: typeof body.icon === "string" ? body.icon : "",
    targetCount
  };
}

export function parseUpdateHabitInput(body: Record<string, unknown>): UpdateHabitInput | null {
  const input: UpdateHabitInput = {};

  if ("name" in body) {
    const name = parseRequiredText(body.name);
    if (!name) {
      return null;
    }
    input.name = name;
  }

  if ("description" in body) {
    if (typeof body.description !== "string") {
      return null;
    }
    input.description = body.description;
  }

  if ("icon" in body) {
    if (typeof body.icon !== "string") {
      return null;
    }
    input.icon = body.icon;
  }

  if ("targetCount" in body) {
    const targetCount = parseTargetCount(body.targetCount);
    if (!targetCount) {
      return null;
    }
    input.targetCount = targetCount;
  }

  return input;
}

function parseTargetCount(value: unknown, fallback?: number): number | null {
  if (value === undefined) {
    return fallback ?? null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    return null;
  }

  return value;
}

function parseRequiredText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
