import type { Task, TaskDueState } from "@/types/task";

export function toggleTaskCompletion(tasks: Task[], taskId: string, completed: boolean, now = new Date()): Task[] {
  const timestamp = now.toISOString();

  return tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      status: completed ? "completed" : "not_started",
      completedAt: completed ? timestamp : null,
      updatedAt: timestamp
    };
  });
}

export function getTaskProgress(task: Task, tasks: Task[]): { completed: number; total: number } {
  const children = tasks.filter((item) => item.parentTaskId === task.id);

  return {
    completed: children.filter((item) => item.status === "completed").length,
    total: children.length
  };
}

export function getTaskDueState(task: Task, now = new Date()): TaskDueState {
  if (!task.dueDate || task.status === "completed") {
    return "none";
  }

  const today = toUtcDateOnly(now);
  const dueDate = parseDateOnly(task.dueDate);
  const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / 86_400_000);

  if (daysUntilDue < 0) {
    return "overdue";
  }

  if (daysUntilDue <= 2) {
    return "near_due";
  }

  return "none";
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
