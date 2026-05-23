import { describe, expect, it } from "vitest";

import {
  getTaskDueState,
  getTaskProgress,
  toggleTaskCompletion
} from "@/lib/domain/tasks";
import type { Task } from "@/types/task";

const now = new Date("2026-05-07T08:00:00.000Z");

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Write introduction",
    description: "",
    status: "not_started",
    priority: "medium",
    dueDate: null,
    parentTaskId: null,
    sortOrder: 0,
    createdAt: "2026-05-07T08:00:00.000Z",
    updatedAt: "2026-05-07T08:00:00.000Z",
    completedAt: null,
    ...overrides
  };
}

describe("task domain rules", () => {
  it("does not complete subtasks when a parent task is completed", () => {
    const parent = task({ id: "parent" });
    const child = task({ id: "child", parentTaskId: "parent" });

    const result = toggleTaskCompletion([parent, child], "parent", true, now);

    expect(result.find((item) => item.id === "parent")?.status).toBe("completed");
    expect(result.find((item) => item.id === "child")?.status).toBe("not_started");
  });

  it("does not complete the parent when every subtask is completed", () => {
    const parent = task({ id: "parent", status: "in_progress" });
    const childA = task({ id: "child-a", parentTaskId: "parent" });
    const childB = task({ id: "child-b", parentTaskId: "parent", status: "completed" });

    const result = toggleTaskCompletion([parent, childA, childB], "child-a", true, now);

    expect(result.find((item) => item.id === "child-a")?.status).toBe("completed");
    expect(result.find((item) => item.id === "parent")?.status).toBe("in_progress");
  });

  it("reports subtask progress for parent tasks", () => {
    const parent = task({ id: "parent" });
    const childA = task({ id: "child-a", parentTaskId: "parent", status: "completed" });
    const childB = task({ id: "child-b", parentTaskId: "parent", status: "paused" });

    expect(getTaskProgress(parent, [parent, childA, childB])).toEqual({
      completed: 1,
      total: 2
    });
  });

  it("marks unfinished tasks due within two days as near due", () => {
    expect(
      getTaskDueState(task({ dueDate: "2026-05-09" }), new Date("2026-05-07T00:00:00.000Z"))
    ).toBe("near_due");
  });

  it("marks unfinished tasks before today as overdue", () => {
    expect(
      getTaskDueState(task({ dueDate: "2026-05-06" }), new Date("2026-05-07T00:00:00.000Z"))
    ).toBe("overdue");
  });

  it("does not mark completed tasks as due", () => {
    expect(
      getTaskDueState(
        task({ dueDate: "2026-05-06", status: "completed" }),
        new Date("2026-05-07T00:00:00.000Z")
      )
    ).toBe("none");
  });
});
