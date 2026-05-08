import { randomUUID } from "node:crypto";

import { MVP_DATA_FILES } from "@/lib/data/data-dir";
import { JsonStore } from "@/lib/data/json-store";
import type { AiActionLog, AiActionStatus } from "@/types/assistant";
import type { CareRecord, CareSource } from "@/types/care";
import type { CreateHabitInput, Habit, HabitCheckin, UpdateHabitInput } from "@/types/habit";
import type { CreateTaskInput, Task, UpdateTaskInput } from "@/types/task";
import type { TrashEntry } from "@/types/trash";

export async function initializeDataFiles(dataDir: string): Promise<void> {
  await Promise.all(MVP_DATA_FILES.map((fileName) => new JsonStore<unknown>(dataDir, fileName).read()));
}

export function createRepositories(dataDir: string) {
  const trash = new TrashRepository(
    new JsonStore<TrashEntry>(dataDir, "trash.json", { validateItem: isTrashEntry })
  );
  const tasks = new TaskRepository(new JsonStore<Task>(dataDir, "tasks.json", { validateItem: isTask }), trash);

  const habitCheckins = new HabitCheckinRepository(
    new JsonStore<HabitCheckin>(dataDir, "habit-checkins.json", { validateItem: isHabitCheckin })
  );

  return {
    tasks,
    trash,
    habits: new HabitRepository(new JsonStore<Habit>(dataDir, "habits.json", { validateItem: isHabit })),
    habitCheckins,
    careRecords: new CollectionRepository(
      new JsonStore<CareRecord>(dataDir, "care-records.json", { validateItem: isCareRecord })
    ),
    aiLogs: new CollectionRepository(
      new JsonStore<AiActionLog>(dataDir, "ai-logs.json", { validateItem: isAiActionLog })
    )
  };
}

class TaskRepository {
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: JsonStore<Task>,
    private readonly trash: TrashRepository
  ) {}

  async list(): Promise<Task[]> {
    return (await this.store.read()).items;
  }

  async get(taskId: string): Promise<Task | null> {
    const tasks = await this.list();
    return tasks.find((task) => task.id === taskId) ?? null;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    return this.enqueueMutation(async () => {
      let task: Task | null = null;

      await this.store.updateItems((tasks) => {
        validateParentTask(input.parentTaskId, tasks);

        const now = new Date().toISOString();
        task = {
          id: randomUUID(),
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          dueDate: input.dueDate,
          parentTaskId: input.parentTaskId,
          createdAt: now,
          updatedAt: now,
          completedAt: input.status === "completed" ? now : null
        };

        return [...tasks, task];
      });

      if (!task) {
        throw new Error("Task was not created");
      }

      return task;
    });
  }

  async delete(taskId: string, deletedAt = new Date().toISOString()): Promise<void> {
    await this.enqueueMutation(async () => {
      await this.store.updateItems(async (tasks) => {
        const task = tasks.find((item) => item.id === taskId);

        if (!task) {
          return tasks;
        }

        const deletedTasks = tasks.filter((item) => item.id === task.id || item.parentTaskId === task.id);

        await this.trash.addMany(
          deletedTasks.map((deletedTask) => ({
            id: randomUUID(),
            deletedType: "task",
            deletedAt,
            originalId: deletedTask.id,
            originalData: deletedTask
          }))
        );

        return tasks.filter((item) => !deletedTasks.some((deletedTask) => deletedTask.id === item.id));
      });
    });
  }

  async update(taskId: string, input: UpdateTaskInput): Promise<Task | null> {
    return this.enqueueMutation(async () => {
      let updatedTask: Task | null = null;

      await this.store.updateItems((tasks) => {
        const now = new Date().toISOString();

        return tasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          const nextStatus = input.status ?? task.status;
          const wasCompleted = task.status === "completed";
          const isCompleted = nextStatus === "completed";
          const nextTask: Task = {
            ...task,
            ...input,
            status: nextStatus,
            updatedAt: now,
            completedAt: isCompleted ? (wasCompleted ? task.completedAt ?? now : now) : null
          };

          updatedTask = nextTask;
          return nextTask;
        });
      });

      return updatedTask;
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);

    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    );

    return next;
  }
}

class TrashRepository {
  constructor(private readonly store: JsonStore<TrashEntry>) {}

  async list(): Promise<TrashEntry[]> {
    return (await this.store.read()).items;
  }

  async add(entry: TrashEntry): Promise<TrashEntry> {
    await this.store.updateItems((entries) => [...entries, entry]);
    return entry;
  }

  async addMany(entries: TrashEntry[]): Promise<TrashEntry[]> {
    await this.store.updateItems((existingEntries) => [...existingEntries, ...entries]);
    return entries;
  }
}

class HabitRepository {
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: JsonStore<Habit>) {}

  async list(): Promise<Habit[]> {
    return (await this.store.read()).items.map(normalizeHabit);
  }

  async get(habitId: string): Promise<Habit | null> {
    const habits = await this.list();
    return habits.find((habit) => habit.id === habitId) ?? null;
  }

  async create(input: CreateHabitInput): Promise<Habit> {
    return this.enqueueMutation(async () => {
      const now = new Date().toISOString();
      const habit: Habit = {
        id: randomUUID(),
        name: input.name,
        description: input.description,
        icon: input.icon,
        targetCount: input.targetCount,
        isActive: true,
        createdAt: now,
        updatedAt: now
      };

      await this.store.updateItems((habits) => [...habits, habit]);
      return habit;
    });
  }

  async update(habitId: string, input: UpdateHabitInput): Promise<Habit | null> {
    return this.enqueueMutation(async () => {
      let updatedHabit: Habit | null = null;

      await this.store.updateItems((habits) => {
        const now = new Date().toISOString();

        return habits.map((storedHabit) => {
          const habit = normalizeHabit(storedHabit);
          if (habit.id !== habitId) {
            return habit;
          }

          updatedHabit = { ...habit, ...input, updatedAt: now };
          return updatedHabit;
        });
      });

      return updatedHabit;
    });
  }

  async deactivate(habitId: string): Promise<Habit | null> {
    return this.update(habitId, { isActive: false } as UpdateHabitInput & { isActive: boolean });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);

    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    );

    return next;
  }
}

class HabitCheckinRepository {
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: JsonStore<HabitCheckin>) {}

  async list(): Promise<HabitCheckin[]> {
    return (await this.store.read()).items.map(normalizeHabitCheckin);
  }

  async get(habitId: string, date: string): Promise<HabitCheckin | null> {
    const checkins = await this.list();
    return checkins.find((checkin) => checkin.habitId === habitId && checkin.date === date) ?? null;
  }

  async complete(habitId: string, date: string, targetCount: number): Promise<{ checkin: HabitCheckin; created: boolean }> {
    return this.enqueueMutation(async () => {
      let checkin: HabitCheckin | null = null;
      let created = false;

      await this.store.updateItems((checkins) => {
        const now = new Date().toISOString();
        const normalizedCheckins = checkins.map(normalizeHabitCheckin);
        const existing = normalizedCheckins.find((item) => item.habitId === habitId && item.date === date);

        if (existing) {
          const completedCount = Math.min(existing.completedCount + 1, targetCount);
          checkin = { ...existing, completedCount, isCompleted: completedCount >= targetCount, updatedAt: now };
          return normalizedCheckins.map((item) => (item.id === existing.id ? checkin! : item));
        }

        created = true;
        checkin = {
          id: randomUUID(),
          habitId,
          date,
          isCompleted: targetCount <= 1,
          completedCount: 1,
          note: "",
          createdAt: now,
          updatedAt: now
        };

        return [...normalizedCheckins, checkin];
      });

      if (!checkin) {
        throw new Error("Habit check-in was not created");
      }

      return { checkin, created };
    });
  }

  async decrement(habitId: string, date: string, targetCount: number): Promise<HabitCheckin | null> {
    return this.enqueueMutation(async () => {
      let updated: HabitCheckin | null = null;

      await this.store.updateItems((checkins) => {
        const now = new Date().toISOString();
        const normalizedCheckins = checkins.map(normalizeHabitCheckin);

        return normalizedCheckins.flatMap((checkin) => {
          if (checkin.habitId !== habitId || checkin.date !== date) {
            return [checkin];
          }

          const completedCount = Math.max(checkin.completedCount - 1, 0);
          if (completedCount === 0) {
            updated = null;
            return [];
          }

          updated = { ...checkin, completedCount, isCompleted: completedCount >= targetCount, updatedAt: now };
          return [updated];
        });
      });

      return updated;
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);

    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    );

    return next;
  }
}

class CollectionRepository<T> {
  constructor(private readonly store: JsonStore<T>) {}

  async list(): Promise<T[]> {
    return (await this.store.read()).items;
  }

  async add(item: T): Promise<T> {
    await this.store.updateItems((items) => [...items, item]);
    return item;
  }
}

function validateParentTask(parentTaskId: string | null, tasks: Task[]): void {
  if (parentTaskId === null) {
    return;
  }

  const parent = tasks.find((task) => task.id === parentTaskId);

  if (!parent) {
    throw new Error("Parent task does not exist");
  }

  if (parent.parentTaskId !== null) {
    throw new Error("Parent task must be a top-level task");
  }
}

function isTask(value: unknown): value is Task {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    isTaskStatus(value.status) &&
    isTaskPriority(value.priority) &&
    isStringOrNull(value.parentTaskId) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isStringOrNull(value.completedAt) &&
    isStringOrNull(value.dueDate)
  );
}

function isTrashEntry(value: unknown): value is TrashEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.deletedType === "string" &&
    typeof value.deletedAt === "string" &&
    typeof value.originalId === "string" &&
    "originalData" in value &&
    value.originalData !== undefined
  );
}

function isHabit(value: unknown): value is Habit {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.icon === "string" &&
    (value.targetCount === undefined || typeof value.targetCount === "number") &&
    typeof value.isActive === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isHabitCheckin(value: unknown): value is HabitCheckin {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.habitId === "string" &&
    typeof value.date === "string" &&
    typeof value.isCompleted === "boolean" &&
    (value.completedCount === undefined || typeof value.completedCount === "number") &&
    typeof value.note === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function normalizeHabit(habit: Habit): Habit {
  return {
    ...habit,
    targetCount: normalizeTargetCount(habit.targetCount)
  };
}

function normalizeHabitCheckin(checkin: HabitCheckin): HabitCheckin {
  const completedCount = typeof checkin.completedCount === "number" ? checkin.completedCount : checkin.isCompleted ? 1 : 0;

  return {
    ...checkin,
    completedCount,
    isCompleted: completedCount > 0 ? checkin.isCompleted : false
  };
}

function normalizeTargetCount(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 1;
}

function isCareRecord(value: unknown): value is CareRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.content === "string" &&
    isCareSource(value.source) &&
    typeof value.isChecked === "boolean" &&
    typeof value.moodNote === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isAiActionLog(value: unknown): value is AiActionLog {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.userMessage === "string" &&
    typeof value.actionType === "string" &&
    "actionPayload" in value &&
    value.actionPayload !== undefined &&
    isAiActionStatus(value.status) &&
    typeof value.createdAt === "string"
  );
}

function isTaskStatus(value: unknown): value is Task["status"] {
  return value === "not_started" || value === "in_progress" || value === "paused" || value === "completed";
}

function isTaskPriority(value: unknown): value is Task["priority"] {
  return value === "low" || value === "medium" || value === "high";
}

function isCareSource(value: unknown): value is CareSource {
  return value === "ai_generated" || value === "fallback";
}

function isAiActionStatus(value: unknown): value is AiActionStatus {
  return (
    value === "proposed" ||
    value === "confirmed_executed" ||
    value === "rejected" ||
    value === "failed"
  );
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
