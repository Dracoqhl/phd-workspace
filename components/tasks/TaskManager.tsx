"use client";

import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { getTaskDueState, getTaskProgress } from "@/lib/domain/tasks";
import type { Task, TaskPriority, TaskStatus } from "@/types/task";

interface TaskDraft {
  title: string;
  description: string;
}

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" }
];

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

const emptyForm = {
  title: "",
  description: "",
  priority: "medium" as TaskPriority,
  dueDate: ""
};

export function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subtaskTitles, setSubtaskTitles] = useState<Record<string, string>>({});
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});

  useEffect(() => {
    let active = true;

    async function loadTasks() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/tasks");
        const payload = (await response.json()) as { tasks?: Task[]; error?: string };

        if (!response.ok || !payload.tasks) {
          throw new Error(payload.error ?? "Unable to load tasks.");
        }

        if (active) {
          setTasks(payload.tasks);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load tasks.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTasks();

    return () => {
      active = false;
    };
  }, []);

  const topLevelTasks = useMemo(() => {
    return tasks.filter((task) => task.parentTaskId === null && (showCompleted || task.status !== "completed"));
  }, [showCompleted, tasks]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();

    if (!title) {
      setError("Task title is required.");
      return;
    }

    const payload = {
      title,
      description: form.description.trim(),
      status: "not_started" as TaskStatus,
      priority: form.priority,
      dueDate: form.dueDate || null,
      parentTaskId: null
    };

    const created = await writeTask("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    if (created) {
      setTasks((current) => [...current, created]);
      setForm(emptyForm);
    }
  }

  async function updateTask(taskId: string, input: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "dueDate">>) {
    const updated = await writeTask(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(input) });
    if (updated) {
      setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
      setTaskDrafts((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
    }
  }

  async function createSubtask(parentTask: Task) {
    const title = (subtaskTitles[parentTask.id] ?? "").trim();
    if (!title) {
      setError("Subtask title is required.");
      return;
    }

    const created = await writeTask(`/api/tasks/${parentTask.id}/subtasks`, {
      method: "POST",
      body: JSON.stringify({
        title,
        description: "",
        status: "not_started",
        priority: parentTask.priority,
        dueDate: null
      })
    });

    if (created) {
      setTasks((current) => [...current, created]);
      setSubtaskTitles((current) => ({ ...current, [parentTask.id]: "" }));
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}" and all subtasks?`)) {
      return;
    }

    setError(null);
    const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Unable to delete task.");
      return;
    }

    setTasks((current) => current.filter((item) => item.id !== task.id && item.parentTaskId !== task.id));
  }

  async function deleteSubtask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) {
      return;
    }

    setError(null);
    const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Unable to delete subtask.");
      return;
    }

    setTasks((current) => current.filter((item) => item.id !== task.id));
  }

  async function writeTask(url: string, init: RequestInit): Promise<Task | null> {
    setError(null);
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
    });
    const payload = (await response.json()) as { task?: Task; error?: string };

    if (!response.ok || !payload.task) {
      setError(payload.error ?? "Unable to save task.");
      return null;
    }

    return payload.task;
  }

  return (
    <section aria-label="任务管理" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">任务管理</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">管理一级任务和一层子任务，已完成一级任务默认隐藏。</p>
        </div>
        <button
          className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => setShowCompleted((value) => !value)}
          type="button"
        >
          {showCompleted ? "Hide Completed" : "Show Completed"}
        </button>
      </div>

      <form className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_auto_auto_auto]" onSubmit={createTask}>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Task title
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            value={form.title}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Task description
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            value={form.description}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Task priority
          <select
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))}
            value={form.priority}
          >
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Due date
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
            type="date"
            value={form.dueDate}
          />
        </label>
        <button className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
          <Plus aria-hidden="true" size={16} />
          Create Task
        </button>
      </form>

      {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {loading ? <p className="mt-5 text-sm text-slate-600">Loading tasks...</p> : null}

      {!loading && topLevelTasks.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600">No active tasks yet.</p>
      ) : null}

      <div className="mt-5 grid gap-4">
        {topLevelTasks.map((task) => (
          <TaskCard
            key={task.id}
            onCreateSubtask={createSubtask}
            onDelete={deleteTask}
            onDeleteSubtask={deleteSubtask}
            onDraftChange={(taskId, draft) => setTaskDrafts((current) => ({ ...current, [taskId]: draft }))}
            onSubtaskTitleChange={(value) => setSubtaskTitles((current) => ({ ...current, [task.id]: value }))}
            onUpdate={updateTask}
            subtaskTitle={subtaskTitles[task.id] ?? ""}
            task={task}
            taskDrafts={taskDrafts}
            tasks={tasks}
          />
        ))}
      </div>
    </section>
  );
}

interface TaskCardProps {
  task: Task;
  tasks: Task[];
  taskDrafts: Record<string, TaskDraft>;
  subtaskTitle: string;
  onUpdate: (taskId: string, input: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "dueDate">>) => Promise<void>;
  onCreateSubtask: (task: Task) => Promise<void>;
  onSubtaskTitleChange: (value: string) => void;
  onDraftChange: (taskId: string, draft: TaskDraft) => void;
  onDelete: (task: Task) => Promise<void>;
  onDeleteSubtask: (task: Task) => Promise<void>;
}

function TaskCard({ task, tasks, taskDrafts, subtaskTitle, onUpdate, onCreateSubtask, onSubtaskTitleChange, onDraftChange, onDelete, onDeleteSubtask }: TaskCardProps) {
  const children = tasks.filter((item) => item.parentTaskId === task.id);
  const progress = getTaskProgress(task, tasks);
  const dueState = getTaskDueState(task);
  const dueClass = dueState === "overdue" ? "border-red-300 bg-red-50" : dueState === "near_due" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white";
  const taskDraft = taskDrafts[task.id] ?? { title: task.title, description: task.description };

  return (
    <article aria-label={task.title} className={`rounded-lg border p-4 ${dueClass} ${task.status === "completed" ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold text-ink">{task.title}</h3>
          {task.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{task.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="rounded border border-slate-200 bg-white px-2 py-1">{labelFor(statusOptions, task.status)}</span>
            <span className="rounded border border-slate-200 bg-white px-2 py-1">{labelFor(priorityOptions, task.priority)}</span>
            {task.dueDate ? <span className="rounded border border-slate-200 bg-white px-2 py-1">Due {task.dueDate}</span> : null}
            <span className="rounded border border-slate-200 bg-white px-2 py-1">{progress.completed}/{progress.total} subtasks completed</span>
          </div>
        </div>

        <button
          aria-label="Delete Task"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
          onClick={() => void onDelete(task)}
          type="button"
        >
          <Trash2 aria-hidden="true" size={16} />
          Delete Task
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Title for {task.title}
          <input
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => onDraftChange(task.id, { ...taskDraft, title: event.target.value })}
            value={taskDraft.title}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Description for {task.title}
          <input
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => onDraftChange(task.id, { ...taskDraft, description: event.target.value })}
            value={taskDraft.description}
          />
        </label>
        <button
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => void onUpdate(task.id, { title: taskDraft.title, description: taskDraft.description })}
          type="button"
        >
          Save Task
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Status for {task.title}
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => void onUpdate(task.id, { status: event.target.value as TaskStatus })}
            value={task.status}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Priority for {task.title}
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => void onUpdate(task.id, { priority: event.target.value as TaskPriority })}
            value={task.priority}
          >
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Due date for {task.title}
          <input
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => void onUpdate(task.id, { dueDate: event.target.value || null })}
            type="date"
            value={task.dueDate ?? ""}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-2">
        {children.map((child) => (
          <SubtaskRow
            child={child}
            draft={taskDrafts[child.id] ?? { title: child.title, description: child.description }}
            key={child.id}
            onDelete={onDeleteSubtask}
            onDraftChange={onDraftChange}
            onUpdate={onUpdate}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 md:flex-row">
        <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
          New subtask for {task.title}
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-moss"
            onChange={(event) => onSubtaskTitleChange(event.target.value)}
            value={subtaskTitle}
          />
        </label>
        <button className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void onCreateSubtask(task)} type="button">
          <Plus aria-hidden="true" size={16} />
          Add Subtask
        </button>
      </div>
    </article>
  );
}

interface SubtaskRowProps {
  child: Task;
  draft: TaskDraft;
  onDraftChange: (taskId: string, draft: TaskDraft) => void;
  onUpdate: (taskId: string, input: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "dueDate">>) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}

function SubtaskRow({ child, draft, onDraftChange, onUpdate, onDelete }: SubtaskRowProps) {
  return (
    <div className="grid gap-2 rounded-md border border-slate-200 bg-white px-3 py-3 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto] lg:items-end" key={child.id}>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Title for {child.title}
        <input
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-ink outline-none focus:border-moss"
          onChange={(event) => onDraftChange(child.id, { ...draft, title: event.target.value })}
          value={draft.title}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Description for {child.title}
        <input
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-ink outline-none focus:border-moss"
          onChange={(event) => onDraftChange(child.id, { ...draft, description: event.target.value })}
          value={draft.description}
        />
      </label>
      <select
        aria-label={`Status for ${child.title}`}
        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-ink"
        onChange={(event) => void onUpdate(child.id, { status: event.target.value as TaskStatus })}
        value={child.status}
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Priority for {child.title}
        <select
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-ink outline-none focus:border-moss"
          onChange={(event) => void onUpdate(child.id, { priority: event.target.value as TaskPriority })}
          value={child.priority}
        >
          {priorityOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Due date for {child.title}
        <input
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-ink outline-none focus:border-moss"
          onChange={(event) => void onUpdate(child.id, { dueDate: event.target.value || null })}
          type="date"
          value={child.dueDate ?? ""}
        />
      </label>
      <button
        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() => void onUpdate(child.id, { title: draft.title, description: draft.description })}
        type="button"
      >
        Save Subtask
      </button>
      <button
        aria-label="Delete Subtask"
        className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
        onClick={() => void onDelete(child)}
        type="button"
      >
        Delete Subtask
      </button>
    </div>
  );
}

function labelFor<T extends string>(options: Array<{ value: T; label: string }>, value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
