import { createHash, randomBytes, randomUUID } from "node:crypto";

import { hashPassword, normalizeEmail, verifyPasswordHash } from "@/lib/auth/credentials";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import type { SqliteDatabase } from "@/lib/db/database";
import type { InviteCode, PublicUser, User, UserRole } from "@/types/user";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

interface InviteRow {
  id: string;
  code: string;
  created_by_user_id: string;
  consumed_by_user_id: string | null;
  consumed_at: string | null;
  created_at: string;
}

interface AdminInviteRow extends InviteRow {
  consumed_by_email: string | null;
}

interface AdminUserRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  tasks_count: number;
  habits_count: number;
}

export interface AdminOverview {
  stats: {
    users: number;
    invites: number;
    usedInvites: number;
    unusedInvites: number;
    tasks: number;
    habits: number;
  };
  invites: Array<InviteCode & { status: "used" | "unused"; consumedByEmail: string | null }>;
  users: Array<{
    id: string;
    email: string;
    role: UserRole;
    createdAt: string;
    tasksCount: number;
    habitsCount: number;
  }>;
}

export interface AuthSession {
  token: string;
  user: User;
}

export class UserRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findByEmail(email: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  findById(userId: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  create(input: { email: string; password: string; role: UserRole }): User {
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      email: normalizeEmail(input.email),
      passwordHash: hashPassword(input.password),
      role: input.role,
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES (@id, @email, @passwordHash, @role, @createdAt, @updatedAt)`
    ).run(user);

    return user;
  }

  verifyCredentials(email: string, password: string): User | null {
    const user = this.findByEmail(email);
    if (!user || !verifyPasswordHash(password, user.passwordHash)) {
      return null;
    }
    return user;
  }
}

export class SessionRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(userId: string, now = new Date()): AuthSession {
    const token = randomBytes(32).toString("base64url");
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

    this.db.prepare(
      `INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at)
       VALUES (@id, @tokenHash, @userId, @expiresAt, @createdAt)`
    ).run({
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt,
      createdAt
    });

    const row = this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as UserRow | undefined;
    if (!row) {
      throw new Error("Session user was not found");
    }

    return { token, user: mapUser(row) };
  }

  findUserByToken(token: string | undefined, now = new Date()): User | null {
    if (!token) {
      return null;
    }

    const row = this.db
      .prepare(
        `SELECT users.* FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
      )
      .get(hashSessionToken(token), now.toISOString()) as UserRow | undefined;

    return row ? mapUser(row) : null;
  }

  deleteByToken(token: string | undefined): void {
    if (!token) return;
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
  }
}

export class InviteRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(createdByUserId: string): InviteCode {
    const invite: InviteCode = {
      id: randomUUID(),
      code: randomBytes(12).toString("base64url"),
      createdByUserId,
      consumedByUserId: null,
      consumedAt: null,
      createdAt: new Date().toISOString()
    };

    this.db.prepare(
      `INSERT INTO invite_codes (id, code, created_by_user_id, consumed_by_user_id, consumed_at, created_at)
       VALUES (@id, @code, @createdByUserId, @consumedByUserId, @consumedAt, @createdAt)`
    ).run(invite);

    return invite;
  }

  list(): InviteCode[] {
    const rows = this.db
      .prepare("SELECT * FROM invite_codes ORDER BY created_at DESC")
      .all() as InviteRow[];
    return rows.map(mapInvite);
  }

  consume(code: string, consumeWithUser: () => User): User | null {
    const user = consumeWithUser();
    const consumed = this.db
      .prepare(
        `UPDATE invite_codes
         SET consumed_by_user_id = ?, consumed_at = ?
         WHERE code = ? AND consumed_by_user_id IS NULL
         RETURNING id`
      )
      .get(user.id, new Date().toISOString(), code.trim()) as { id: string } | undefined;

    if (!consumed) {
      this.db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      return null;
    }

    return user;
  }
}

export class AdminOverviewRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(): AdminOverview {
    const usersCount = getCount(this.db, "SELECT COUNT(*) AS count FROM users");
    const invitesCount = getCount(this.db, "SELECT COUNT(*) AS count FROM invite_codes");
    const usedInvitesCount = getCount(this.db, "SELECT COUNT(*) AS count FROM invite_codes WHERE consumed_by_user_id IS NOT NULL");
    const tasksCount = getCount(this.db, "SELECT COUNT(*) AS count FROM tasks");
    const habitsCount = getCount(this.db, "SELECT COUNT(*) AS count FROM habits");
    const invites = this.db
      .prepare(
        `SELECT invite_codes.*, users.email AS consumed_by_email
         FROM invite_codes
         LEFT JOIN users ON users.id = invite_codes.consumed_by_user_id
         ORDER BY invite_codes.created_at DESC`
      )
      .all() as AdminInviteRow[];
    const users = this.db
      .prepare(
        `SELECT users.id, users.email, users.role, users.created_at,
                COUNT(DISTINCT tasks.id) AS tasks_count,
                COUNT(DISTINCT habits.id) AS habits_count
         FROM users
         LEFT JOIN tasks ON tasks.user_id = users.id
         LEFT JOIN habits ON habits.user_id = users.id
         GROUP BY users.id, users.email, users.role, users.created_at
         ORDER BY users.created_at ASC`
      )
      .all() as AdminUserRow[];

    return {
      stats: {
        users: usersCount,
        invites: invitesCount,
        usedInvites: usedInvitesCount,
        unusedInvites: invitesCount - usedInvitesCount,
        tasks: tasksCount,
        habits: habitsCount
      },
      invites: invites.map((row) => ({
        ...mapInvite(row),
        status: row.consumed_by_user_id ? "used" : "unused",
        consumedByEmail: row.consumed_by_email
      })),
      users: users.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
        tasksCount: row.tasks_count,
        habitsCount: row.habits_count
      }))
    };
  }
}

export function toPublicUser(user: User): PublicUser {
  return {
    email: user.email,
    role: user.role
  };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getCount(db: SqliteDatabase, sql: string): number {
  const row = db.prepare(sql).get() as { count: number } | undefined;
  return row?.count ?? 0;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInvite(row: InviteRow): InviteCode {
  return {
    id: row.id,
    code: row.code,
    createdByUserId: row.created_by_user_id,
    consumedByUserId: row.consumed_by_user_id,
    consumedAt: row.consumed_at,
    createdAt: row.created_at
  };
}
