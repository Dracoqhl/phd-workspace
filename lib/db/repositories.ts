import { randomUUID } from "node:crypto";

import type { SqliteDatabase } from "@/lib/db/database";
import type { AiActionLog } from "@/types/assistant";
import type { AiChatMessage } from "@/types/ai-chat";
import type { CareQuotePreference, CareRecord } from "@/types/care";
import type { CreateHabitInput, Habit, HabitCheckin, UpdateHabitInput } from "@/types/habit";
import type { CreateTaskInput, Task, UpdateTaskInput } from "@/types/task";
import type { TrashEntry } from "@/types/trash";

export function createSqliteRepositories(db: SqliteDatabase, userId: string) {
  const trash = new SqliteTrashRepository(db, userId);
  return {
    tasks: new SqliteTaskRepository(db, userId, trash),
    trash,
    habits: new SqliteHabitRepository(db, userId),
    habitCheckins: new SqliteHabitCheckinRepository(db, userId),
    careRecords: new SqliteCareRecordRepository(db, userId),
    careQuotePreferences: new SqliteCareQuotePreferenceRepository(db, userId),
    aiLogs: new SqliteAiLogRepository(db, userId),
    aiChatMessages: new SqliteAiChatMessageRepository(db, userId)
  };
}

class SqliteTaskRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly userId: string,
    private readonly trash: SqliteTrashRepository
  ) {}

  async list(): Promise<Task[]> {
    const rows = this.db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at ASC").all(this.userId) as TaskRow[];
    return rows.map(mapTask);
  }

  async get(taskId: string): Promise<Task | null> {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(taskId, this.userId) as TaskRow | undefined;
    return row ? mapTask(row) : null;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const tasks = await this.list();
    validateParentTask(input.parentTaskId, tasks);
    const now = new Date().toISOString();
    const task: Task = {
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

    this.db.prepare(
      `INSERT INTO tasks
       (id, user_id, title, description, status, priority, due_date, parent_task_id, created_at, updated_at, completed_at)
       VALUES (@id, @userId, @title, @description, @status, @priority, @dueDate, @parentTaskId, @createdAt, @updatedAt, @completedAt)`
    ).run({ ...task, userId: this.userId });

    return task;
  }

  async update(taskId: string, input: UpdateTaskInput): Promise<Task | null> {
    const existing = await this.get(taskId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const nextStatus = input.status ?? existing.status;
    const isCompleted = nextStatus === "completed";
    const wasCompleted = existing.status === "completed";
    const task: Task = {
      ...existing,
      ...input,
      status: nextStatus,
      updatedAt: now,
      completedAt: isCompleted ? (wasCompleted ? existing.completedAt ?? now : now) : null
    };

    this.db.prepare(
      `UPDATE tasks
       SET title = @title, description = @description, status = @status, priority = @priority,
           due_date = @dueDate, parent_task_id = @parentTaskId, updated_at = @updatedAt, completed_at = @completedAt
       WHERE id = @id AND user_id = @userId`
    ).run({ ...task, userId: this.userId });

    return task;
  }

  async delete(taskId: string, deletedAt = new Date().toISOString()): Promise<void> {
    const deletedTasks = (this.db
      .prepare("SELECT * FROM tasks WHERE user_id = ? AND (id = ? OR parent_task_id = ?)")
      .all(this.userId, taskId, taskId) as TaskRow[]).map(mapTask);

    if (deletedTasks.length === 0) return;

    const transaction = this.db.transaction(() => {
      deletedTasks.forEach((task) => {
        this.trash.addSync({
          id: randomUUID(),
          deletedType: "task",
          deletedAt,
          originalId: task.id,
          originalData: task
        });
      });
      this.db.prepare("DELETE FROM tasks WHERE user_id = ? AND (id = ? OR parent_task_id = ?)").run(this.userId, taskId, taskId);
    });
    transaction();
  }
}

class SqliteHabitRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly userId: string
  ) {}

  async list(): Promise<Habit[]> {
    const rows = this.db.prepare("SELECT * FROM habits WHERE user_id = ? ORDER BY created_at ASC").all(this.userId) as HabitRow[];
    return rows.map(mapHabit);
  }

  async get(habitId: string): Promise<Habit | null> {
    const row = this.db.prepare("SELECT * FROM habits WHERE id = ? AND user_id = ?").get(habitId, this.userId) as HabitRow | undefined;
    return row ? mapHabit(row) : null;
  }

  async create(input: CreateHabitInput): Promise<Habit> {
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
    this.db.prepare(
      `INSERT INTO habits
       (id, user_id, name, description, icon, target_count, is_active, created_at, updated_at)
       VALUES (@id, @userId, @name, @description, @icon, @targetCount, @isActive, @createdAt, @updatedAt)`
    ).run({ ...habit, userId: this.userId, isActive: 1 });
    return habit;
  }

  async update(habitId: string, input: UpdateHabitInput): Promise<Habit | null> {
    const existing = await this.get(habitId);
    if (!existing) return null;
    const habit: Habit = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.db.prepare(
      `UPDATE habits
       SET name = @name, description = @description, icon = @icon, target_count = @targetCount,
           is_active = @isActive, updated_at = @updatedAt
       WHERE id = @id AND user_id = @userId`
    ).run({ ...habit, userId: this.userId, isActive: habit.isActive ? 1 : 0 });
    return habit;
  }

  async deactivate(habitId: string): Promise<Habit | null> {
    return this.update(habitId, { isActive: false } as UpdateHabitInput & { isActive: boolean });
  }
}

class SqliteHabitCheckinRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly userId: string
  ) {}

  async list(): Promise<HabitCheckin[]> {
    const rows = this.db.prepare("SELECT * FROM habit_checkins WHERE user_id = ? ORDER BY created_at ASC").all(this.userId) as HabitCheckinRow[];
    return rows.map(mapHabitCheckin);
  }

  async get(habitId: string, date: string): Promise<HabitCheckin | null> {
    const row = this.db
      .prepare("SELECT * FROM habit_checkins WHERE user_id = ? AND habit_id = ? AND date = ?")
      .get(this.userId, habitId, date) as HabitCheckinRow | undefined;
    return row ? mapHabitCheckin(row) : null;
  }

  async complete(habitId: string, date: string, targetCount: number): Promise<{ checkin: HabitCheckin; created: boolean }> {
    const existing = await this.get(habitId, date);
    const now = new Date().toISOString();
    if (existing) {
      const completedCount = Math.min(existing.completedCount + 1, targetCount);
      const checkin = { ...existing, completedCount, isCompleted: completedCount >= targetCount, updatedAt: now };
      this.updateCheckin(checkin);
      return { checkin, created: false };
    }

    const checkin: HabitCheckin = {
      id: randomUUID(),
      habitId,
      date,
      isCompleted: targetCount <= 1,
      completedCount: 1,
      note: "",
      createdAt: now,
      updatedAt: now
    };
    this.db.prepare(
      `INSERT INTO habit_checkins
       (id, user_id, habit_id, date, is_completed, completed_count, note, created_at, updated_at)
       VALUES (@id, @userId, @habitId, @date, @isCompleted, @completedCount, @note, @createdAt, @updatedAt)`
    ).run({ ...checkin, userId: this.userId, isCompleted: checkin.isCompleted ? 1 : 0 });
    return { checkin, created: true };
  }

  async decrement(habitId: string, date: string, targetCount: number): Promise<HabitCheckin | null> {
    const existing = await this.get(habitId, date);
    if (!existing) return null;
    const completedCount = Math.max(existing.completedCount - 1, 0);
    if (completedCount === 0) {
      this.db.prepare("DELETE FROM habit_checkins WHERE user_id = ? AND habit_id = ? AND date = ?").run(this.userId, habitId, date);
      return null;
    }

    const checkin = { ...existing, completedCount, isCompleted: completedCount >= targetCount, updatedAt: new Date().toISOString() };
    this.updateCheckin(checkin);
    return checkin;
  }

  private updateCheckin(checkin: HabitCheckin): void {
    this.db.prepare(
      `UPDATE habit_checkins
       SET is_completed = @isCompleted, completed_count = @completedCount, note = @note, updated_at = @updatedAt
       WHERE id = @id AND user_id = @userId`
    ).run({ ...checkin, userId: this.userId, isCompleted: checkin.isCompleted ? 1 : 0 });
  }
}

class SqliteCareRecordRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly userId: string
  ) {}

  async list(): Promise<CareRecord[]> {
    const rows = this.db.prepare("SELECT * FROM care_records WHERE user_id = ? ORDER BY date DESC").all(this.userId) as CareRecordRow[];
    return rows.map(mapCareRecord);
  }

  async getByDate(date: string): Promise<CareRecord | null> {
    const row = this.db.prepare("SELECT * FROM care_records WHERE user_id = ? AND date = ?").get(this.userId, date) as CareRecordRow | undefined;
    return row ? mapCareRecord(row) : null;
  }

  async upsertByDate(date: string, buildRecord: (existing: CareRecord | null) => CareRecord): Promise<CareRecord> {
    const existing = await this.getByDate(date);
    const record = buildRecord(existing);
    if (existing) {
      this.db.prepare(
        `UPDATE care_records
         SET content = @content, source = @source, is_checked = @isChecked, mood_note = @moodNote,
             energy_level = @energyLevel, is_favorite = @isFavorite, focus_text = @focusText, updated_at = @updatedAt
         WHERE id = @id AND user_id = @userId`
      ).run(toCareParams(record, this.userId));
      return record;
    }

    this.db.prepare(
      `INSERT INTO care_records
       (id, user_id, date, content, source, is_checked, mood_note, energy_level, is_favorite, focus_text, created_at, updated_at)
       VALUES (@id, @userId, @date, @content, @source, @isChecked, @moodNote, @energyLevel, @isFavorite, @focusText, @createdAt, @updatedAt)`
    ).run(toCareParams(record, this.userId));
    return record;
  }
}

class SqliteCareQuotePreferenceRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly userId: string
  ) {}

  async get(): Promise<CareQuotePreference | null> {
    const row = this.db
      .prepare("SELECT * FROM care_quote_preferences WHERE user_id = ?")
      .get(this.userId) as CareQuotePreferenceRow | undefined;
    return row ? mapCareQuotePreference(row) : null;
  }

  async save(input: Pick<CareQuotePreference, "preferenceText" | "quotes" | "quoteIndex">): Promise<CareQuotePreference> {
    const existing = await this.get();
    const now = new Date().toISOString();
    const cache: CareQuotePreference = {
      preferenceText: input.preferenceText,
      quotes: input.quotes,
      quoteIndex: normalizeQuoteIndex(input.quoteIndex, input.quotes),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (existing) {
      this.db
        .prepare(
          `UPDATE care_quote_preferences
           SET preference_text = @preferenceText, quotes_json = @quotesJson, quote_index = @quoteIndex, updated_at = @updatedAt
           WHERE user_id = @userId`
        )
        .run(toCareQuotePreferenceParams(cache, this.userId));
      return cache;
    }

    this.db
      .prepare(
        `INSERT INTO care_quote_preferences (user_id, preference_text, quotes_json, quote_index, created_at, updated_at)
         VALUES (@userId, @preferenceText, @quotesJson, @quoteIndex, @createdAt, @updatedAt)`
      )
      .run(toCareQuotePreferenceParams(cache, this.userId));
    return cache;
  }
}

class SqliteAiLogRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly userId: string
  ) {}

  async list(): Promise<AiActionLog[]> {
    const rows = this.db.prepare("SELECT * FROM ai_action_logs WHERE user_id = ? ORDER BY created_at ASC").all(this.userId) as AiLogRow[];
    return rows.map(mapAiLog);
  }

  async add(item: AiActionLog): Promise<AiActionLog> {
    this.db.prepare(
      `INSERT INTO ai_action_logs (id, user_id, user_message, action_type, action_payload, status, created_at)
       VALUES (@id, @userId, @userMessage, @actionType, @actionPayload, @status, @createdAt)`
    ).run({ ...item, userId: this.userId, actionPayload: JSON.stringify(item.actionPayload) });
    return item;
  }
}

class SqliteAiChatMessageRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly userId: string
  ) {}

  async listRecent(limit = 50): Promise<AiChatMessage[]> {
    const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM ai_chat_messages
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ?
         )
         ORDER BY created_at ASC`
      )
      .all(this.userId, normalizedLimit) as AiChatMessageRow[];
    return rows.map(mapAiChatMessage);
  }

  async add(input: Pick<AiChatMessage, "role" | "content">): Promise<AiChatMessage> {
    const message: AiChatMessage = {
      id: randomUUID(),
      role: input.role,
      content: input.content,
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare(
        `INSERT INTO ai_chat_messages (id, user_id, role, content, created_at)
         VALUES (@id, @userId, @role, @content, @createdAt)`
      )
      .run({ ...message, userId: this.userId });
    return message;
  }

  async clear(): Promise<void> {
    this.db.prepare("DELETE FROM ai_chat_messages WHERE user_id = ?").run(this.userId);
  }
}

class SqliteTrashRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly userId: string
  ) {}

  async list(): Promise<TrashEntry[]> {
    const rows = this.db.prepare("SELECT * FROM trash_entries WHERE user_id = ? ORDER BY deleted_at ASC").all(this.userId) as TrashRow[];
    return rows.map(mapTrash);
  }

  async add(entry: TrashEntry): Promise<TrashEntry> {
    this.addSync(entry);
    return entry;
  }

  async addMany(entries: TrashEntry[]): Promise<TrashEntry[]> {
    entries.forEach((entry) => this.addSync(entry));
    return entries;
  }

  addSync(entry: TrashEntry): void {
    this.db.prepare(
      `INSERT INTO trash_entries (id, user_id, deleted_type, deleted_at, original_id, original_data)
       VALUES (@id, @userId, @deletedType, @deletedAt, @originalId, @originalData)`
    ).run({ ...entry, userId: this.userId, originalData: JSON.stringify(entry.originalData) });
  }
}

interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  due_date: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface HabitRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  target_count: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface HabitCheckinRow {
  id: string;
  habit_id: string;
  date: string;
  is_completed: number;
  completed_count: number;
  note: string;
  created_at: string;
  updated_at: string;
}

interface CareRecordRow {
  id: string;
  date: string;
  content: string;
  source: CareRecord["source"];
  is_checked: number;
  mood_note: string;
  energy_level: CareRecord["energyLevel"];
  is_favorite: number;
  focus_text: string;
  created_at: string;
  updated_at: string;
}

interface CareQuotePreferenceRow {
  preference_text: string;
  quotes_json: string;
  quote_index: number;
  created_at: string;
  updated_at: string;
}

interface AiLogRow {
  id: string;
  user_message: string;
  action_type: AiActionLog["actionType"];
  action_payload: string;
  status: AiActionLog["status"];
  created_at: string;
}

interface AiChatMessageRow {
  id: string;
  role: AiChatMessage["role"];
  content: string;
  created_at: string;
}

interface TrashRow {
  id: string;
  deleted_type: string;
  deleted_at: string;
  original_id: string;
  original_data: string;
}

function validateParentTask(parentTaskId: string | null, tasks: Task[]): void {
  if (parentTaskId === null) return;
  const parent = tasks.find((task) => task.id === parentTaskId);
  if (!parent || parent.parentTaskId !== null) {
    throw new Error("Parent task does not exist");
  }
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    parentTaskId: row.parent_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    targetCount: row.target_count,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapHabitCheckin(row: HabitCheckinRow): HabitCheckin {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.date,
    isCompleted: row.is_completed === 1,
    completedCount: row.completed_count,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCareRecord(row: CareRecordRow): CareRecord {
  return {
    id: row.id,
    date: row.date,
    content: row.content,
    source: row.source,
    isChecked: row.is_checked === 1,
    moodNote: row.mood_note,
    energyLevel: row.energy_level,
    isFavorite: row.is_favorite === 1,
    focusText: row.focus_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCareQuotePreference(row: CareQuotePreferenceRow): CareQuotePreference {
  return {
    preferenceText: row.preference_text,
    quotes: parseQuoteJson(row.quotes_json),
    quoteIndex: row.quote_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAiLog(row: AiLogRow): AiActionLog {
  return {
    id: row.id,
    userMessage: row.user_message,
    actionType: row.action_type,
    actionPayload: JSON.parse(row.action_payload) as Record<string, unknown>,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapAiChatMessage(row: AiChatMessageRow): AiChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  };
}

function mapTrash(row: TrashRow): TrashEntry {
  return {
    id: row.id,
    deletedType: row.deleted_type,
    deletedAt: row.deleted_at,
    originalId: row.original_id,
    originalData: JSON.parse(row.original_data) as TrashEntry["originalData"]
  };
}

function toCareParams(record: CareRecord, userId: string) {
  return {
    ...record,
    userId,
    isChecked: record.isChecked ? 1 : 0,
    isFavorite: record.isFavorite ? 1 : 0
  };
}

function toCareQuotePreferenceParams(cache: CareQuotePreference, userId: string) {
  return {
    userId,
    preferenceText: cache.preferenceText,
    quotesJson: JSON.stringify(cache.quotes),
    quoteIndex: normalizeQuoteIndex(cache.quoteIndex, cache.quotes),
    createdAt: cache.createdAt,
    updatedAt: cache.updatedAt
  };
}

function parseQuoteJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function normalizeQuoteIndex(index: number, quotes: string[]): number {
  if (quotes.length === 0) return 0;
  return Number.isInteger(index) && index >= 0 && index < quotes.length ? index : 0;
}
