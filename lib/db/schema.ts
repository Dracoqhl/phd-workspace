import { randomUUID } from "node:crypto";

import { hashPassword, normalizeEmail } from "@/lib/auth/credentials";
import type { SqliteDatabase } from "@/lib/db/database";

export function ensureDatabaseSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      consumed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      due_date TEXT,
      parent_task_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habit_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      is_completed INTEGER NOT NULL,
      completed_count INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, habit_id, date)
    );

    CREATE TABLE IF NOT EXISTS care_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      is_checked INTEGER NOT NULL,
      mood_note TEXT NOT NULL,
      energy_level INTEGER,
      is_favorite INTEGER NOT NULL,
      focus_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS care_quote_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      preference_text TEXT NOT NULL,
      quotes_json TEXT NOT NULL,
      quote_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_action_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_message TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_payload TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      proposals_json TEXT NOT NULL DEFAULT '[]',
      action_state TEXT NOT NULL DEFAULT 'pending',
      action_status TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quick_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quick_link_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      display_name TEXT NOT NULL,
      icon_url TEXT NOT NULL,
      default_link_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, domain)
    );

    CREATE TABLE IF NOT EXISTS quick_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trash_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deleted_type TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      original_id TEXT NOT NULL,
      original_data TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
    CREATE INDEX IF NOT EXISTS idx_care_records_user_id ON care_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user_id ON ai_action_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user_created_at ON ai_chat_messages(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_quick_notes_user_created_at ON quick_notes(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_quick_link_groups_user_order ON quick_link_groups(user_id, sort_order, created_at);
    CREATE INDEX IF NOT EXISTS idx_quick_links_user_group_order ON quick_links(user_id, group_id, sort_order, created_at);
  `);

  ensureColumn(db, "ai_chat_messages", "proposals_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "ai_chat_messages", "action_state", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "ai_chat_messages", "action_status", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "tasks", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureAdminUser(db);
}

function ensureColumn(db: SqliteDatabase, tableName: string, columnName: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

function ensureAdminUser(db: SqliteDatabase): void {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, role, created_at, updated_at)
     SELECT @id, @email, @passwordHash, 'admin', @createdAt, @updatedAt
     WHERE NOT EXISTS (SELECT 1 FROM users)`
  ).run({
    id: randomUUID(),
    email,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now
  });
}
