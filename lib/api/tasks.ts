import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import { createSqliteRepositories } from "@/lib/db/repositories";
import type { AuthContext } from "@/lib/api/auth";
import type { CreateTaskInput, TaskPriority, TaskStatus, UpdateTaskInput } from "@/types/task";

export const INVALID_TASK_PAYLOAD = "Invalid task payload";
export const DATA_DIR_CONFIG_ERROR = "Data directory is not configured";

export function dataConfigErrorResponse(): Response {
  return Response.json({ error: DATA_DIR_CONFIG_ERROR }, { status: 500 });
}

export function getTaskRepositories(auth?: AuthContext) {
  if (isDatabaseConfigured()) {
    if (!auth?.user) {
      throw new Error("Authenticated user is required");
    }
    const db = getDatabase();
    ensureDatabaseSchema(db);
    return createSqliteRepositories(db, auth.user.id);
  }

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

export function parseCreateTaskInput(body: Record<string, unknown>, parentTaskId: string | null): CreateTaskInput | null {
  const title = parseTitle(body.title);
  if (!title) {
    return null;
  }

  const description = typeof body.description === "string" ? body.description : "";
  const status = parseStatus(body.status, "not_started");
  const priority = parsePriority(body.priority, "medium");
  const dueDate = parseDateOrNull(body.dueDate);

  if (!status || !priority || dueDate === undefined) {
    return null;
  }

  return {
    title,
    description,
    status,
    priority,
    dueDate,
    parentTaskId
  };
}

export function parseUpdateTaskInput(body: Record<string, unknown>): UpdateTaskInput | null {
  const input: UpdateTaskInput = {};

  if ("title" in body) {
    const title = parseTitle(body.title);
    if (!title) {
      return null;
    }
    input.title = title;
  }

  if ("description" in body) {
    if (typeof body.description !== "string") {
      return null;
    }
    input.description = body.description;
  }

  if ("status" in body) {
    const status = parseStatus(body.status);
    if (!status) {
      return null;
    }
    input.status = status;
  }

  if ("priority" in body) {
    const priority = parsePriority(body.priority);
    if (!priority) {
      return null;
    }
    input.priority = priority;
  }

  if ("dueDate" in body) {
    const dueDate = parseDateOrNull(body.dueDate);
    if (dueDate === undefined) {
      return null;
    }
    input.dueDate = dueDate;
  }

  return input;
}

function parseTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const title = value.trim();
  return title.length > 0 ? title : null;
}

function parseStatus(value: unknown, fallback?: TaskStatus): TaskStatus | null {
  if (value === undefined) {
    return fallback ?? null;
  }

  return value === "not_started" || value === "in_progress" || value === "paused" || value === "completed"
    ? value
    : null;
}

function parsePriority(value: unknown, fallback?: TaskPriority): TaskPriority | null {
  if (value === undefined) {
    return fallback ?? null;
  }

  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function parseDateOrNull(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
