import { randomUUID } from "node:crypto";

import { MVP_DATA_FILES } from "@/lib/data/data-dir";
import { JsonStore } from "@/lib/data/json-store";
import type { AiActionLog, AiActionStatus } from "@/types/assistant";
import type { CareRecord, CareSource } from "@/types/care";
import type { Habit, HabitCheckin } from "@/types/habit";
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

  return {
    tasks,
    trash,
    habits: new CollectionRepository(new JsonStore<Habit>(dataDir, "habits.json", { validateItem: isHabit })),
    habitCheckins: new CollectionRepository(
      new JsonStore<HabitCheckin>(dataDir, "habit-checkins.json", { validateItem: isHabitCheckin })
    ),
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
    typeof value.note === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
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
