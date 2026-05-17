export type TaskStatus = "not_started" | "next" | "in_progress" | "waiting" | "blocked" | "paused" | "completed";

export type TaskPriority = "low" | "medium" | "high";

export type TaskDueState = "none" | "near_due" | "overdue";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  status: Exclude<TaskStatus, "completed"> | TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  parentTaskId: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
}
