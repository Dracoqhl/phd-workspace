import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MVP_DATA_FILES, resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories, initializeDataFiles } from "@/lib/data/repositories";

let tempDir: string | null = null;

afterEach(async () => {
  vi.unstubAllEnvs();

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("data directory helpers", () => {
  it("resolves DATA_DIR from an explicit value", () => {
    expect(resolveDataDir("/tmp/phd-data")).toBe("/tmp/phd-data");
  });

  it("resolves DATA_DIR from the environment by default", () => {
    vi.stubEnv("DATA_DIR", "/tmp/phd-env-data");

    expect(resolveDataDir()).toBe("/tmp/phd-env-data");
  });

  it("throws a clear error when default DATA_DIR is missing", () => {
    vi.stubEnv("DATA_DIR", undefined);

    expect(() => resolveDataDir()).toThrow("DATA_DIR is not configured");
  });

  it("throws a clear error when DATA_DIR is missing", () => {
    expect(() => resolveDataDir("")).toThrow("DATA_DIR is not configured");
  });

  it("throws a clear error when DATA_DIR is whitespace only", () => {
    expect(() => resolveDataDir("   ")).toThrow("DATA_DIR is not configured");
  });

  it("throws a clear error when DATA_DIR is not absolute", () => {
    expect(() => resolveDataDir("relative/path")).toThrow("DATA_DIR must be an absolute path");
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

  it("gets and updates an existing task without changing child tasks", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    const repos = createRepositories(tempDir);

    const parent = await repos.tasks.create({
      title: "Paper",
      description: "Initial",
      status: "not_started",
      priority: "medium",
      dueDate: null,
      parentTaskId: null
    });
    const child = await repos.tasks.create({
      title: "Outline",
      description: "",
      status: "not_started",
      priority: "low",
      dueDate: null,
      parentTaskId: parent.id
    });

    await expect(repos.tasks.get(parent.id)).resolves.toEqual(parent);

    const updated = await repos.tasks.update(parent.id, {
      title: "Paper draft",
      description: "Revised",
      status: "completed",
      priority: "high",
      dueDate: "2026-05-20"
    });

    expect(updated).not.toBeNull();
    if (!updated) {
      throw new Error("Expected task to be updated");
    }

    expect(updated).toMatchObject({
      id: parent.id,
      title: "Paper draft",
      description: "Revised",
      status: "completed",
      priority: "high",
      dueDate: "2026-05-20",
      parentTaskId: null
    });
    expect(updated.completedAt).toEqual(expect.any(String));

    const tasks = await repos.tasks.list();
    expect(tasks.find((task) => task.id === child.id)?.status).toBe("not_started");
  });

  it("clears completedAt when an updated task leaves completed status", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    const repos = createRepositories(tempDir);

    const task = await repos.tasks.create({
      title: "Read",
      description: "",
      status: "completed",
      priority: "medium",
      dueDate: null,
      parentTaskId: null
    });

    const updated = await repos.tasks.update(task.id, { status: "in_progress" });

    expect(updated).not.toBeNull();
    if (!updated) {
      throw new Error("Expected task to be updated");
    }

    expect(updated.status).toBe("in_progress");
    expect(updated.completedAt).toBeNull();
  });

  it("returns null when getting or updating a missing task", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    const repos = createRepositories(tempDir);

    await expect(repos.tasks.get("missing")).resolves.toBeNull();
    await expect(repos.tasks.update("missing", { title: "Nope" })).resolves.toBeNull();
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

  it("does not duplicate trash entries when concurrent deletes target the same parent", async () => {
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

    await Promise.all([repos.tasks.delete(parent.id, "test-now"), repos.tasks.delete(parent.id, "test-now")]);

    await expect(repos.tasks.list()).resolves.toEqual([]);
    const trash = await repos.trash.list();
    expect(trash.map((entry) => entry.originalId).sort()).toEqual([child.id, parent.id].sort());
    expect(trash.filter((entry) => entry.originalId === parent.id)).toHaveLength(1);
    expect(trash.filter((entry) => entry.originalId === child.id)).toHaveLength(1);
  });

  it("leaves tasks unchanged when trash cannot be read during delete", async () => {
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
    await writeFile(join(tempDir, "trash.json"), "{", "utf8");

    await expect(repos.tasks.delete(task.id, "test-now")).rejects.toThrow();
    await expect(repos.tasks.list()).resolves.toEqual([task]);
  });

  it("does not duplicate trash entries when separate repository instances delete the same parent", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    const firstRepos = createRepositories(tempDir);
    const secondRepos = createRepositories(tempDir);

    const parent = await firstRepos.tasks.create({
      title: "Paper",
      description: "",
      status: "not_started",
      priority: "high",
      dueDate: null,
      parentTaskId: null
    });
    const child = await firstRepos.tasks.create({
      title: "Outline",
      description: "",
      status: "not_started",
      priority: "medium",
      dueDate: null,
      parentTaskId: parent.id
    });

    const repos = [
      firstRepos,
      secondRepos,
      ...Array.from({ length: 18 }, () => createRepositories(tempDir!))
    ];

    await Promise.all(repos.map((repo) => repo.tasks.delete(parent.id, "test-now")));

    await expect(firstRepos.tasks.list()).resolves.toEqual([]);
    const trash = await firstRepos.trash.list();
    expect(trash.map((entry) => entry.originalId).sort()).toEqual([child.id, parent.id].sort());
    expect(trash.filter((entry) => entry.originalId === parent.id)).toHaveLength(1);
    expect(trash.filter((entry) => entry.originalId === child.id)).toHaveLength(1);
  });

  it("rejects a task with a nonexistent parent", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    const repos = createRepositories(tempDir);

    await expect(
      repos.tasks.create({
        title: "Orphan",
        description: "",
        status: "not_started",
        priority: "medium",
        dueDate: null,
        parentTaskId: "missing-parent"
      })
    ).rejects.toThrow("Parent task does not exist");
  });

  it("rejects a task whose parent is already a subtask", async () => {
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

    await expect(
      repos.tasks.create({
        title: "Nested",
        description: "",
        status: "not_started",
        priority: "low",
        dueDate: null,
        parentTaskId: child.id
      })
    ).rejects.toThrow("Parent task must be a top-level task");
  });

  it("exposes narrow collection repositories for non-task stores", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    const repos = createRepositories(tempDir);

    const habit = {
      name: "Write",
      description: "",
      icon: "pen",
    };

    expect("read" in repos.habits).toBe(false);
    await expect(repos.habits.create(habit)).resolves.toMatchObject({ ...habit, isActive: true });
    await expect(repos.habits.list()).resolves.toEqual([expect.objectContaining({ ...habit, isActive: true })]);
  });

  it("rejects malformed persisted task items", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, "tasks.json"),
      '{\n  "schemaVersion": 1,\n  "items": [{ "id": "task-1" }]\n}\n',
      "utf8"
    );
    const repos = createRepositories(tempDir);

    await expect(repos.tasks.list()).rejects.toThrow("Invalid versioned collection item at index 0");
  });

  it("rejects malformed persisted trash items", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, "trash.json"),
      '{\n  "schemaVersion": 1,\n  "items": [{ "id": "trash-1" }]\n}\n',
      "utf8"
    );
    const repos = createRepositories(tempDir);

    await expect(repos.trash.list()).rejects.toThrow("Invalid versioned collection item at index 0");
  });

  it.each([
    ["habits", "habits.json", "habits"],
    ["habit checkins", "habit-checkins.json", "habitCheckins"],
    ["care records", "care-records.json", "careRecords"],
    ["AI logs", "ai-logs.json", "aiLogs"]
  ] as const)("rejects malformed persisted %s items", async (_name, fileName, repositoryName) => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-repos-"));
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, fileName),
      '{\n  "schemaVersion": 1,\n  "items": [{ "id": "item-1" }]\n}\n',
      "utf8"
    );
    const repos = createRepositories(tempDir);

    await expect(repos[repositoryName].list()).rejects.toThrow(
      "Invalid versioned collection item at index 0"
    );
  });
});
