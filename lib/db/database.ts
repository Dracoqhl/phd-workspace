import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

let database: SqliteDatabase | null = null;
let databasePath: string | null = null;

export class SqliteDatabase {
  readonly open = true;

  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) {
      execFileSync("sqlite3", [path, "PRAGMA user_version;"], { encoding: "utf8" });
    }
  }

  exec(sql: string): void {
    execFileSync("sqlite3", [this.path, sql], { encoding: "utf8" });
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.path, sql);
  }

  transaction<T>(operation: () => T): () => T {
    return operation;
  }

  close(): void {
    // The CLI opens and closes per statement, so there is no persistent handle.
  }

  pragma(sql: string): void {
    this.exec(`PRAGMA ${sql};`);
  }
}

export class SqliteStatement {
  constructor(
    private readonly path: string,
    private readonly sql: string
  ) {}

  run(...params: unknown[]): void {
    execFileSync("sqlite3", [this.path, interpolateSql(this.sql, params)], { encoding: "utf8" });
  }

  get(...params: unknown[]): unknown {
    const rows = this.all(...params);
    return rows[0];
  }

  all(...params: unknown[]): unknown[] {
    const sql = interpolateSql(this.sql, params);
    const output = execFileSync("sqlite3", ["-json", this.path, sql], { encoding: "utf8" }).trim();
    return output ? (JSON.parse(output) as unknown[]) : [];
  }
}

export function isDatabaseConfigured(value = process.env.DATABASE_PATH): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveDatabasePath(value = process.env.DATABASE_PATH): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error("DATABASE_PATH is not configured. Set DATABASE_PATH to an absolute SQLite file path.");
  }

  if (!isAbsolute(normalized)) {
    throw new Error("DATABASE_PATH must be an absolute path.");
  }

  return normalized;
}

export function getDatabase(path = resolveDatabasePath()): SqliteDatabase {
  if (database && databasePath === path) {
    return database;
  }

  database = new SqliteDatabase(path);
  database.exec("PRAGMA foreign_keys = ON;");
  databasePath = path;
  return database;
}

export function closeDatabase(): void {
  database = null;
  databasePath = null;
}

function interpolateSql(sql: string, params: unknown[]): string {
  if (params.length === 1 && isRecord(params[0])) {
    return Object.entries(params[0]).reduce(
      (nextSql, [key, value]) => nextSql.replaceAll(`@${key}`, toSqlLiteral(value)),
      sql
    );
  }

  let index = 0;
  return sql.replace(/\?/g, () => toSqlLiteral(params[index++]));
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
