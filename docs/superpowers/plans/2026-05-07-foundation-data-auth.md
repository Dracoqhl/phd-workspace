# Foundation Data Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation slice for versioned JSON persistence, `DATA_DIR` initialization, and password-protected access.

**Architecture:** Keep persistence in server-only `lib/data` modules with a generic versioned collection store and a repository factory. Keep authentication in `lib/auth`, expose thin App Router auth endpoints, and render either a login form or the existing workspace shell from `app/page.tsx` based on server-side session state. Feature CRUD remains out of scope.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Vitest, Testing Library, Tailwind CSS, Node `fs/promises`, Node `crypto`.

---

## File Structure

- Create `types/data.ts`: shared `VersionedCollection<T>` type and `SCHEMA_VERSION` constant.
- Create `types/habit.ts`, `types/care.ts`, `types/assistant.ts`: minimal entity types needed for versioned stores and example files.
- Modify `lib/data/json-store.ts`: store and update `VersionedCollection<T>` rather than raw arrays/objects.
- Create `lib/data/data-dir.ts`: resolve `DATA_DIR`, throw clear config errors, expose MVP file names.
- Modify `lib/data/repositories.ts`: create all versioned stores, initialize all files, keep task/trash operations passing.
- Create `lib/auth/password.ts`: validate configured password and verify login input.
- Create `lib/auth/session.ts`: sign and verify 30-day cookie sessions.
- Create `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/session/route.ts`: thin auth HTTP endpoints.
- Modify `app/page.tsx`: server-render login form when unauthenticated and workspace shell when authenticated.
- Create `app/login-form.tsx`: client component for submitting password and showing errors.
- Create `data.example/*.json`: versioned example files for all MVP data stores.
- Modify `tests/unit/data/*.test.ts`: update expectations for versioned collections and full initialization.
- Create `tests/unit/auth/*.test.ts`: auth helper tests.
- Modify `tests/unit/app/page.test.tsx`: test unauthenticated and authenticated page states.
- Modify `Readme.md`, `architecture.md`, `.env.example`: document `DATA_DIR`, `APP_PASSWORD`, auth routes, versioned JSON shape, `AI_BASE_URL`.

---

### Task 1: Versioned Collection Store

**Files:**
- Create: `types/data.ts`
- Modify: `lib/data/json-store.ts`
- Modify: `tests/unit/data/json-store.test.ts`

- [ ] **Step 1: Replace the JSON store tests with versioned collection expectations**

Write this complete file to `tests/unit/data/json-store.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { JsonStore } from "@/lib/data/json-store";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("JsonStore", () => {
  it("initializes a missing versioned collection file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const store = new JsonStore<string>(tempDir, "items.json");

    await expect(store.read()).resolves.toEqual({ schemaVersion: 1, items: [] });
    await expect(readFile(join(tempDir, "items.json"), "utf8")).resolves.toContain(
      '"schemaVersion": 1'
    );
  });

  it("persists versioned collection updates through a callback", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const store = new JsonStore<string>(tempDir, "items.json");

    await store.updateItems((items) => [...items, "write"]);

    await expect(store.read()).resolves.toEqual({ schemaVersion: 1, items: ["write"] });
  });

  it("does not silently overwrite invalid JSON", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    await import("node:fs/promises").then(({ mkdir, writeFile }) =>
      mkdir(tempDir!, { recursive: true }).then(() => writeFile(join(tempDir!, "items.json"), "{", "utf8"))
    );
    const store = new JsonStore<string>(tempDir, "items.json");

    await expect(store.read()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the store test and verify RED**

Run:

```bash
pnpm test tests/unit/data/json-store.test.ts
```

Expected: FAIL because `JsonStore` still requires a third constructor argument and has no `updateItems` method.

- [ ] **Step 3: Add the versioned collection type**

Create `types/data.ts`:

```ts
export const SCHEMA_VERSION = 1;

export interface VersionedCollection<T> {
  schemaVersion: typeof SCHEMA_VERSION;
  items: T[];
}
```

- [ ] **Step 4: Implement the versioned JSON store**

Replace `lib/data/json-store.ts` with:

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { SCHEMA_VERSION, type VersionedCollection } from "@/types/data";

export class JsonStore<T> {
  private readonly filePath: string;

  constructor(
    private readonly dataDir: string,
    private readonly fileName: string
  ) {
    this.filePath = join(dataDir, fileName);
  }

  async read(): Promise<VersionedCollection<T>> {
    await this.ensureFile();
    const content = await readFile(this.filePath, "utf8");
    return JSON.parse(content) as VersionedCollection<T>;
  }

  async write(data: VersionedCollection<T>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = join(this.dataDir, `.${this.fileName}.${randomUUID()}.tmp`);
    const content = `${JSON.stringify(data, null, 2)}\n`;

    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, this.filePath);
  }

  async update(
    updater: (
      data: VersionedCollection<T>
    ) => VersionedCollection<T> | Promise<VersionedCollection<T>>
  ): Promise<VersionedCollection<T>> {
    const current = await this.read();
    const next = await updater(current);
    await this.write(next);
    return next;
  }

  async updateItems(updater: (items: T[]) => T[] | Promise<T[]>): Promise<T[]> {
    const next = await this.update(async (collection) => ({
      schemaVersion: SCHEMA_VERSION,
      items: await updater(collection.items)
    }));
    return next.items;
  }

  private async ensureFile(): Promise<void> {
    try {
      await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        await this.write({ schemaVersion: SCHEMA_VERSION, items: [] });
        return;
      }

      throw error;
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
```

- [ ] **Step 5: Run the store test and verify GREEN**

Run:

```bash
pnpm test tests/unit/data/json-store.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add types/data.ts lib/data/json-store.ts tests/unit/data/json-store.test.ts
git commit -m "feat: add versioned json store"
```

---

### Task 2: DATA_DIR Initialization and Versioned Repositories

**Files:**
- Create: `lib/data/data-dir.ts`
- Create: `types/habit.ts`
- Create: `types/care.ts`
- Create: `types/assistant.ts`
- Modify: `lib/data/repositories.ts`
- Modify: `tests/unit/data/repositories.test.ts`

- [ ] **Step 1: Replace repository tests with versioned initialization coverage**

Write this complete file to `tests/unit/data/repositories.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { MVP_DATA_FILES, resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories, initializeDataFiles } from "@/lib/data/repositories";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("data directory helpers", () => {
  it("resolves DATA_DIR from an explicit value", () => {
    expect(resolveDataDir("/tmp/phd-data")).toBe("/tmp/phd-data");
  });

  it("throws a clear error when DATA_DIR is missing", () => {
    expect(() => resolveDataDir("")).toThrow("DATA_DIR is not configured");
  });
});

describe("repositories", () => {
  it("initializes all MVP data files as versioned collections", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));

    await initializeDataFiles(tempDir);

    for (const fileName of MVP_DATA_FILES) {
      const content = JSON.parse(await readFile(join(tempDir, fileName), "utf8"));
      expect(content).toEqual({ schemaVersion: 1, items: [] });
    }
  });

  it("moves deleted tasks into versioned trash without losing original data", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    const repos = createRepositories(tempDir);

    const task = await repos.tasks.create({
      title: "Read paper",
      description: "",
      status: "not_started",
      priority: "medium",
      dueDate: null,
      parentTaskId: null
    });

    await repos.tasks.delete(task.id, "test-now");

    await expect(repos.tasks.list()).resolves.toEqual([]);
    const trash = await repos.trash.list();
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({
      deletedType: "task",
      deletedAt: "test-now",
      originalId: task.id,
      originalData: expect.objectContaining({ title: "Read paper" })
    });

    const trashFile = JSON.parse(await readFile(join(tempDir, "trash.json"), "utf8"));
    expect(trashFile.schemaVersion).toBe(1);
    expect(trashFile.items).toHaveLength(1);
  });

  it("deletes a parent task and its direct subtasks into trash", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    const repos = createRepositories(tempDir);

    const parent = await repos.tasks.create({
      title: "Paper",
      description: "",
      status: "not_started",
      priority: "high",
      dueDate: null,
      parentTaskId: null
    });
    const child = await repos.tasks.create({
      title: "Outline",
      description: "",
      status: "not_started",
      priority: "medium",
      dueDate: null,
      parentTaskId: parent.id
    });

    await repos.tasks.delete(parent.id, "test-now");

    await expect(repos.tasks.list()).resolves.toEqual([]);
    const trash = await repos.trash.list();
    expect(trash.map((entry) => entry.originalId).sort()).toEqual([child.id, parent.id].sort());
  });
});
```

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```bash
pnpm test tests/unit/data/repositories.test.ts
```

Expected: FAIL because `lib/data/data-dir.ts`, `initializeDataFiles`, and versioned repository behavior do not exist yet.

- [ ] **Step 3: Add minimal domain types for all MVP stores**

Create `types/habit.ts`:

```ts
export interface Habit {
  id: string;
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HabitCheckin {
  id: string;
  habitId: string;
  date: string;
  isCompleted: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}
```

Create `types/care.ts`:

```ts
export type CareSource = "ai_generated" | "fallback";

export interface CareRecord {
  id: string;
  date: string;
  content: string;
  source: CareSource;
  isChecked: boolean;
  moodNote: string;
  createdAt: string;
  updatedAt: string;
}
```

Create `types/assistant.ts`:

```ts
export type AiActionStatus = "proposed" | "confirmed_executed" | "rejected" | "failed";

export interface AiActionLog {
  id: string;
  userMessage: string;
  actionType: string;
  actionPayload: unknown;
  status: AiActionStatus;
  createdAt: string;
}
```

- [ ] **Step 4: Add DATA_DIR helpers**

Create `lib/data/data-dir.ts`:

```ts
export const MVP_DATA_FILES = [
  "tasks.json",
  "habits.json",
  "habit-checkins.json",
  "care-records.json",
  "ai-logs.json",
  "trash.json"
] as const;

export type MvpDataFile = (typeof MVP_DATA_FILES)[number];

export function resolveDataDir(value = process.env.DATA_DIR): string {
  if (!value || value.trim() === "") {
    throw new Error("DATA_DIR is not configured. Set DATA_DIR to an absolute runtime data path.");
  }

  return value;
}
```

- [ ] **Step 5: Update repositories for versioned stores and full initialization**

Replace `lib/data/repositories.ts` with:

```ts
import { randomUUID } from "node:crypto";

import { MVP_DATA_FILES } from "@/lib/data/data-dir";
import { JsonStore } from "@/lib/data/json-store";
import type { AiActionLog } from "@/types/assistant";
import type { CareRecord } from "@/types/care";
import type { Habit, HabitCheckin } from "@/types/habit";
import type { CreateTaskInput, Task } from "@/types/task";
import type { TrashEntry } from "@/types/trash";

export async function initializeDataFiles(dataDir: string): Promise<void> {
  await Promise.all(MVP_DATA_FILES.map((fileName) => new JsonStore<unknown>(dataDir, fileName).read()));
}

export function createRepositories(dataDir: string) {
  const trash = new TrashRepository(new JsonStore<TrashEntry>(dataDir, "trash.json"));
  const tasks = new TaskRepository(new JsonStore<Task>(dataDir, "tasks.json"), trash);

  return {
    tasks,
    trash,
    habits: new JsonStore<Habit>(dataDir, "habits.json"),
    habitCheckins: new JsonStore<HabitCheckin>(dataDir, "habit-checkins.json"),
    careRecords: new JsonStore<CareRecord>(dataDir, "care-records.json"),
    aiLogs: new JsonStore<AiActionLog>(dataDir, "ai-logs.json")
  };
}

class TaskRepository {
  constructor(
    private readonly store: JsonStore<Task>,
    private readonly trash: TrashRepository
  ) {}

  async list(): Promise<Task[]> {
    return (await this.store.read()).items;
  }

  async create(input: CreateTaskInput): Promise<Task> {
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

    await this.store.updateItems((tasks) => [...tasks, task]);
    return task;
  }

  async delete(taskId: string, deletedAt = new Date().toISOString()): Promise<void> {
    const tasks = await this.list();
    const task = tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    const deletedTasks = tasks.filter((item) => item.id === task.id || item.parentTaskId === task.id);
    await Promise.all(
      deletedTasks.map((deletedTask) =>
        this.trash.add({
          id: randomUUID(),
          deletedType: "task",
          deletedAt,
          originalId: deletedTask.id,
          originalData: deletedTask
        })
      )
    );
    await this.store.updateItems((items) =>
      items.filter((item) => !deletedTasks.some((deletedTask) => deletedTask.id === item.id))
    );
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
}
```

- [ ] **Step 6: Run repository tests and verify GREEN**

Run:

```bash
pnpm test tests/unit/data/repositories.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Run all data/domain tests**

Run:

```bash
pnpm test tests/unit/data tests/unit/domain
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/data/data-dir.ts lib/data/repositories.ts types/habit.ts types/care.ts types/assistant.ts tests/unit/data/repositories.test.ts
git commit -m "feat: initialize versioned data files"
```

---

### Task 3: Password and Session Helpers

**Files:**
- Create: `lib/auth/password.ts`
- Create: `lib/auth/session.ts`
- Create: `tests/unit/auth/password.test.ts`
- Create: `tests/unit/auth/session.test.ts`

- [ ] **Step 1: Write password helper tests**

Create `tests/unit/auth/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getConfiguredPassword, verifyPassword } from "@/lib/auth/password";

describe("password auth", () => {
  it("returns a configured APP_PASSWORD", () => {
    expect(getConfiguredPassword("secret")).toBe("secret");
  });

  it("throws a clear error when APP_PASSWORD is missing", () => {
    expect(() => getConfiguredPassword("")).toThrow("APP_PASSWORD is not configured");
  });

  it("accepts the correct password", () => {
    expect(verifyPassword("secret", "secret")).toBe(true);
  });

  it("rejects the wrong password", () => {
    expect(verifyPassword("wrong", "secret")).toBe(false);
  });
});
```

- [ ] **Step 2: Write session helper tests**

Create `tests/unit/auth/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSessionToken, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "@/lib/auth/session";

describe("session auth", () => {
  it("creates a token that verifies with the same password", () => {
    const token = createSessionToken("secret", 1_778_167_498);

    expect(verifySessionToken(token, "secret", 1_778_167_498)).toBe(true);
  });

  it("rejects a token with the wrong password", () => {
    const token = createSessionToken("secret", 1_778_167_498);

    expect(verifySessionToken(token, "changed", 1_778_167_498)).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = createSessionToken("secret", 1_778_167_498);

    expect(verifySessionToken(token, "secret", 1_778_167_498 + SESSION_MAX_AGE_SECONDS + 1)).toBe(
      false
    );
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("not-a-token", "secret", 1_778_167_498)).toBe(false);
  });
});
```

- [ ] **Step 3: Run auth tests and verify RED**

Run:

```bash
pnpm test tests/unit/auth
```

Expected: FAIL because `lib/auth/password.ts` and `lib/auth/session.ts` do not exist.

- [ ] **Step 4: Implement password helpers**

Create `lib/auth/password.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

export function getConfiguredPassword(value = process.env.APP_PASSWORD): string {
  if (!value || value.trim() === "") {
    throw new Error("APP_PASSWORD is not configured. Set APP_PASSWORD before using password login.");
  }

  return value;
}

export function verifyPassword(input: string, configuredPassword = getConfiguredPassword()): boolean {
  const inputBuffer = Buffer.from(input);
  const configuredBuffer = Buffer.from(configuredPassword);

  if (inputBuffer.length !== configuredBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, configuredBuffer);
}
```

- [ ] **Step 5: Implement session helpers**

Create `lib/auth/session.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "phd_workspace_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const SESSION_SALT = "phd-workspace-session-v1";

export function createSessionToken(password: string, nowSeconds = currentUnixSeconds()): string {
  const expiresAt = nowSeconds + SESSION_MAX_AGE_SECONDS;
  const payload = String(expiresAt);
  const signature = signPayload(payload, password);
  return `${payload}.${signature}`;
}

export function verifySessionToken(
  token: string | undefined,
  password: string,
  nowSeconds = currentUnixSeconds()
): boolean {
  if (!token) {
    return false;
  }

  const [expiresAtValue, signature] = token.split(".");
  if (!expiresAtValue || !signature) {
    return false;
  }

  const expiresAt = Number(expiresAtValue);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) {
    return false;
  }

  const expected = signPayload(expiresAtValue, password);
  return safeEqual(signature, expected);
}

function signPayload(payload: string, password: string): string {
  return createHmac("sha256", `${SESSION_SALT}:${password}`).update(payload).digest("hex");
}

function safeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
```

- [ ] **Step 6: Run auth tests and verify GREEN**

Run:

```bash
pnpm test tests/unit/auth
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/password.ts lib/auth/session.ts tests/unit/auth
git commit -m "feat: add password session helpers"
```

---

### Task 4: Auth API Routes

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/auth/session/route.ts`
- Create: `tests/unit/auth/routes.test.ts`

- [ ] **Step 1: Write route handler tests**

Create `tests/unit/auth/routes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as session } from "@/app/api/auth/session/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

describe("auth route handlers", () => {
  it("sets a session cookie for a correct password", async () => {
    vi.stubEnv("APP_PASSWORD", "secret");
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "secret" })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE_NAME);
    vi.unstubAllEnvs();
  });

  it("rejects an incorrect password", async () => {
    vi.stubEnv("APP_PASSWORD", "secret");
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong" })
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ authenticated: false, error: "Invalid password" });
    vi.unstubAllEnvs();
  });

  it("clears the session cookie on logout", async () => {
    const response = await logout();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("reports authenticated session cookies", async () => {
    vi.stubEnv("APP_PASSWORD", "secret");
    const loginResponse = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "secret" })
      })
    );
    const cookie = loginResponse.headers.get("set-cookie")!.split(";")[0];

    const response = await session(
      new Request("http://localhost/api/auth/session", {
        headers: { cookie }
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
pnpm test tests/unit/auth/routes.test.ts
```

Expected: FAIL because auth route files do not exist.

- [ ] **Step 3: Implement login route**

Create `app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getConfiguredPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";

export async function POST(request: Request) {
  let password = "";

  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    password = "";
  }

  const configuredPassword = getConfiguredPassword();

  if (!verifyPassword(password, configuredPassword)) {
    return NextResponse.json({ authenticated: false, error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(configuredPassword),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });

  return response;
}
```

- [ ] **Step 4: Implement logout route**

Create `app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
```

- [ ] **Step 5: Implement session route**

Create `app/api/auth/session/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getConfiguredPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  const authenticated = verifySessionToken(token, getConfiguredPassword());

  return NextResponse.json({ authenticated });
}

function getCookieValue(cookieHeader: string, name: string): string | undefined {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
```

- [ ] **Step 6: Run route tests and verify GREEN**

Run:

```bash
pnpm test tests/unit/auth/routes.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add app/api/auth tests/unit/auth/routes.test.ts
git commit -m "feat: add password auth routes"
```

---

### Task 5: Login Page State

**Files:**
- Create: `app/login-form.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/unit/app/page.test.tsx`

- [ ] **Step 1: Replace page tests for authenticated and unauthenticated states**

Write this complete file to `tests/unit/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspacePageContent } from "@/app/page";

describe("workspace page shell", () => {
  it("renders the login form when unauthenticated", () => {
    render(<WorkspacePageContent authenticated={false} />);

    expect(screen.getByRole("heading", { name: "博士工作台" })).toBeInTheDocument();
    expect(screen.getByLabelText("Access password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
  });

  it("renders the MVP workspace regions when authenticated", () => {
    render(<WorkspacePageContent authenticated />);

    expect(screen.getByRole("heading", { name: "博士工作台" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "任务管理" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "每日健康习惯" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "心灵关怀" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "AI 助手" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run page tests and verify RED**

Run:

```bash
pnpm test tests/unit/app/page.test.tsx
```

Expected: FAIL because `WorkspacePageContent` and login form are not implemented.

- [ ] **Step 3: Create the login form client component**

Create `app/login-form.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setError("Invalid password");
      return;
    }

    window.location.reload();
  }

  return (
    <form className="mt-6 flex w-full max-w-sm flex-col gap-3" onSubmit={handleSubmit}>
      <label className="text-sm font-medium text-slate-700" htmlFor="access-password">
        Access password
      </label>
      <input
        className="rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-moss"
        id="access-password"
        name="password"
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        value={password}
      />
      {error ? <p className="text-sm text-coral">{error}</p> : null}
      <button
        className="rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Logging In" : "Log In"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Update the page to export testable content and check cookies server-side**

Replace `app/page.tsx` with:

```tsx
import { cookies } from "next/headers";

import { LoginForm } from "@/app/login-form";
import { getConfiguredPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

const workspaceSections = [
  {
    title: "心灵关怀",
    description: "这里将显示每日关怀内容、刷新按钮、打卡和心情备注。"
  },
  {
    title: "每日健康习惯",
    description: "这里将显示每日习惯、今日打卡状态和停用入口。"
  },
  {
    title: "任务管理",
    description: "阶段 B 暂未接入数据。下一阶段会连接本地 JSON 任务仓库。"
  }
];

interface WorkspacePageContentProps {
  authenticated: boolean;
}

export default function Page() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const authenticated = verifySessionToken(token, getConfiguredPassword());

  return <WorkspacePageContent authenticated={authenticated} />;
}

export function WorkspacePageContent({ authenticated }: WorkspacePageContentProps) {
  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-4 text-ink">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-moss">PhD Workspace MVP</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">博士工作台</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Enter the server access password to open your personal workspace.
          </p>
          <LoginForm />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="border-b border-slate-200 pb-5">
            <p className="text-sm font-medium text-moss">PhD Workspace MVP</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">博士工作台</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              当前是最小可运行页面壳，用于确认 Next.js、React、Tailwind 和构建流程已经连通。
            </p>
          </header>

          <div className="grid gap-4 xl:grid-cols-3">
            {workspaceSections.map((section) => (
              <section
                aria-label={section.title}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                key={section.title}
              >
                <h2 className="text-base font-semibold text-ink">{section.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{section.description}</p>
              </section>
            ))}
          </div>
        </section>

        <aside
          aria-label="AI 助手"
          className="min-h-48 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:w-[30%]"
        >
          <h2 className="text-base font-semibold text-ink">AI 助手</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            右侧常驻助手会在后续阶段接入 API 测试、聊天、任务拆解和确认卡片。
          </p>
        </aside>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run page tests and verify GREEN**

Run:

```bash
pnpm test tests/unit/app/page.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/login-form.tsx tests/unit/app/page.test.tsx
git commit -m "feat: render password login state"
```

---

### Task 6: Example Data Files and Documentation

**Files:**
- Create: `data.example/tasks.json`
- Create: `data.example/habits.json`
- Create: `data.example/habit-checkins.json`
- Create: `data.example/care-records.json`
- Create: `data.example/ai-logs.json`
- Create: `data.example/trash.json`
- Modify: `.env.example`
- Modify: `Readme.md`
- Modify: `architecture.md`

- [ ] **Step 1: Add versioned example JSON files**

Create each file below with the exact content shown.

`data.example/tasks.json`:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

`data.example/habits.json`:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

`data.example/habit-checkins.json`:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

`data.example/care-records.json`:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

`data.example/ai-logs.json`:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

`data.example/trash.json`:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

- [ ] **Step 2: Update `.env.example`**

Replace `.env.example` with:

```bash
APP_PASSWORD=change-me
DATA_DIR=/absolute/path/to/phd-workspace-data
AI_API_KEY=your-model-api-key
AI_MODEL=your-model-name
AI_BASE_URL=https://api.openai.com/v1
```

- [ ] **Step 3: Update README development status and setup**

Modify `Readme.md` so it contains these exact setup and data-shape sections:

````md
## Local Setup

```bash
pnpm install
cp .env.example .env.local
```

Set:

- `APP_PASSWORD`: password used to open the workspace.
- `DATA_DIR`: absolute path for runtime JSON files outside the repository.
- `AI_API_KEY`: model API key for later AI features.
- `AI_MODEL`: model name for later AI features.
- `AI_BASE_URL`: OpenAI-compatible API base URL.

Run:

```bash
pnpm dev
```

Open `http://localhost:3000`, enter `APP_PASSWORD`, and the app will set a 30-day HTTP-only session cookie.

## Runtime Data Shape

Each JSON file under `DATA_DIR` uses:

```json
{
  "schemaVersion": 1,
  "items": []
}
```
````

- [ ] **Step 4: Update architecture data/auth notes**

Modify `architecture.md` so the data section states that all JSON files are versioned collections and the auth section states that `APP_PASSWORD` plus a 30-day HTTP-only cookie protects the app shell and future APIs.

- [ ] **Step 5: Commit**

```bash
git add data.example .env.example Readme.md architecture.md
git commit -m "docs: document data auth foundation"
```

---

### Task 7: Full Verification

**Files:**
- Verify all changed files from Tasks 1-6.

- [ ] **Step 1: Run lint**

Run:

```bash
pnpm lint
```

Expected: exit 0.

- [ ] **Step 2: Run tests**

Run:

```bash
pnpm test
```

Expected: all test files pass.

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Run production build**

Run:

```bash
APP_PASSWORD=change-me DATA_DIR=/tmp/phd-workspace-data pnpm build
```

Expected: Next.js build exits 0 and prerenders `/`.

- [ ] **Step 5: Start dev server for manual verification**

Run:

```bash
APP_PASSWORD=change-me DATA_DIR=/tmp/phd-workspace-data pnpm dev
```

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 6: Manual verification checklist**

Open `http://localhost:3000` and verify:

- Login form appears before authentication.
- Wrong password shows `Invalid password`.
- `change-me` logs in.
- Workspace shell appears after login.
- Browser refresh keeps the workspace visible.
- Calling `POST /api/auth/logout` clears access and returns to login on refresh.

- [ ] **Step 7: Final status**

Run:

```bash
git status --short
```

Expected: only intentional changes remain. Do not delete unrelated user work.

---

## Self-Review

- Spec coverage: covered versioned data shape, DATA_DIR initialization, auth helpers, auth routes, login page state, example files, docs, and full verification.
- Placeholder scan: no placeholder task remains; every implementation task names exact files and commands.
- Type consistency: `VersionedCollection<T>`, `JsonStore<T>`, `updateItems`, `TaskRepository`, `TrashRepository`, `SESSION_COOKIE_NAME`, and `SESSION_MAX_AGE_SECONDS` are defined before later use.
