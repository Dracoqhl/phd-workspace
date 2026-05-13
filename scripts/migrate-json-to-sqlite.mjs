#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

const databasePath = requireAbsoluteEnv("DATABASE_PATH");
const dataDir = requireAbsoluteEnv("DATA_DIR");
const adminEmail = requireEnv("ADMIN_EMAIL").trim().toLowerCase();
const adminPassword = requireEnv("ADMIN_PASSWORD");

mkdirSync(dirname(databasePath), { recursive: true });
execSql(schemaSql());
const admin = ensureAdminUser();
const marker = "json-v1-admin-import";

if (getOne("SELECT id FROM migration_markers WHERE id = ?", marker)) {
  console.log(`Migration already applied: ${marker}`);
  process.exit(0);
}

const counts = {
  tasks: importCollection("tasks.json", (task) =>
    execSql(
      `INSERT OR IGNORE INTO tasks
       (id, user_id, title, description, status, priority, due_date, parent_task_id, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      task.id,
      admin.id,
      task.title,
      task.description ?? "",
      task.status,
      task.priority,
      task.dueDate ?? null,
      task.parentTaskId ?? null,
      task.createdAt,
      task.updatedAt,
      task.completedAt ?? null
    )
  ),
  habits: importCollection("habits.json", (habit) =>
    execSql(
      `INSERT OR IGNORE INTO habits
       (id, user_id, name, description, icon, target_count, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      habit.id,
      admin.id,
      habit.name,
      habit.description ?? "",
      habit.icon ?? "",
      normalizeCount(habit.targetCount),
      habit.isActive ? 1 : 0,
      habit.createdAt,
      habit.updatedAt
    )
  ),
  habitCheckins: importCollection("habit-checkins.json", (checkin) =>
    execSql(
      `INSERT OR IGNORE INTO habit_checkins
       (id, user_id, habit_id, date, is_completed, completed_count, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      checkin.id,
      admin.id,
      checkin.habitId,
      checkin.date,
      checkin.isCompleted ? 1 : 0,
      normalizeCount(checkin.completedCount ?? (checkin.isCompleted ? 1 : 0), 0, 5),
      checkin.note ?? "",
      checkin.createdAt,
      checkin.updatedAt
    )
  ),
  careRecords: importCollection("care-records.json", (care) =>
    execSql(
      `INSERT OR IGNORE INTO care_records
       (id, user_id, date, content, source, is_checked, mood_note, energy_level, is_favorite, focus_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      care.id,
      admin.id,
      care.date,
      care.content,
      care.source,
      care.isChecked ? 1 : 0,
      care.moodNote ?? "",
      care.energyLevel ?? null,
      care.isFavorite ? 1 : 0,
      care.focusText ?? "",
      care.createdAt,
      care.updatedAt
    )
  ),
  aiLogs: importCollection("ai-logs.json", (log) =>
    execSql(
      `INSERT OR IGNORE INTO ai_action_logs
       (id, user_id, user_message, action_type, action_payload, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      log.id,
      admin.id,
      log.userMessage,
      log.actionType,
      JSON.stringify(log.actionPayload ?? {}),
      log.status,
      log.createdAt
    )
  ),
  trash: importCollection("trash.json", (entry) =>
    execSql(
      `INSERT OR IGNORE INTO trash_entries
       (id, user_id, deleted_type, deleted_at, original_id, original_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      entry.id,
      admin.id,
      entry.deletedType,
      entry.deletedAt,
      entry.originalId,
      JSON.stringify(entry.originalData ?? {})
    )
  )
};

execSql("INSERT INTO migration_markers (id, applied_at) VALUES (?, ?)", marker, new Date().toISOString());
console.log(`Imported JSON data for admin ${admin.email}`);
console.log(JSON.stringify(counts, null, 2));

function importCollection(fileName, importItem) {
  const filePath = join(dataDir, fileName);
  if (!existsSync(filePath)) return 0;
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  items.forEach(importItem);
  return items.length;
}

function ensureAdminUser() {
  const existing = getOne("SELECT id, email FROM users WHERE email = ?", adminEmail);
  if (existing) return existing;

  const id = randomUUID();
  const now = new Date().toISOString();
  execSql(
    "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)",
    id,
    adminEmail,
    hashPassword(adminPassword),
    now,
    now
  );
  return { id, email: adminEmail };
}

function execSql(sql, ...params) {
  execFileSync("sqlite3", [databasePath, interpolateSql(sql, params)], { encoding: "utf8" });
}

function getOne(sql, ...params) {
  const output = execFileSync("sqlite3", ["-json", databasePath, interpolateSql(sql, params)], { encoding: "utf8" }).trim();
  const rows = output ? JSON.parse(output) : [];
  return rows[0] ?? null;
}

function interpolateSql(sql, params) {
  let index = 0;
  return sql.replace(/\?/g, () => toSqlLiteral(params[index++]));
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function normalizeCount(value, min = 1, max = 5) {
  return Number.isInteger(value) && value >= min && value <= max ? value : min;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requireAbsoluteEnv(name) {
  const value = requireEnv(name);
  if (!isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return value;
}

function schemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invite_codes (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, consumed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, consumed_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, due_date TEXT, parent_task_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT);
    CREATE TABLE IF NOT EXISTS habits (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, icon TEXT NOT NULL, target_count INTEGER NOT NULL, is_active INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS habit_checkins (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, habit_id TEXT NOT NULL, date TEXT NOT NULL, is_completed INTEGER NOT NULL, completed_count INTEGER NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, habit_id, date));
    CREATE TABLE IF NOT EXISTS care_records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL, is_checked INTEGER NOT NULL, mood_note TEXT NOT NULL, energy_level INTEGER, is_favorite INTEGER NOT NULL, focus_text TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, date));
    CREATE TABLE IF NOT EXISTS ai_action_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_message TEXT NOT NULL, action_type TEXT NOT NULL, action_payload TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS trash_entries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, deleted_type TEXT NOT NULL, deleted_at TEXT NOT NULL, original_id TEXT NOT NULL, original_data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_markers (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
  `;
}
