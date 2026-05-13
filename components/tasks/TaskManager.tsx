"use client";

import { Calendar, Check, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import { getTaskDueState, getTaskProgress } from "@/lib/domain/tasks";
import type { Task, TaskPriority, TaskStatus } from "@/types/task";

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
  priority: "medium" as TaskPriority,
  dueDate: ""
};

export function TaskManager() {
  const { trackSync } = useSyncStatus();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [pendingCompletionTaskIds, setPendingCompletionTaskIds] = useState<Set<string>>(() => new Set());
  const hasLocalWrites = useRef(false);

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

        if (active && !hasLocalWrites.current) {
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

    hasLocalWrites.current = true;

    try {
      const created = await writeTask("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: "",
          status: "not_started",
          priority: form.priority,
          dueDate: form.dueDate || null,
          parentTaskId: null
        })
      });

      if (created) {
        setTasks((current) => [...current, created]);
        setForm(emptyForm);
      }
    } catch {
      setError("Unable to save task.");
    }
  }

  async function updateTask(taskId: string, input: Partial<Pick<Task, "title" | "status" | "priority" | "dueDate">>) {
    if ("title" in input && input.title?.trim().length === 0) {
      setError("Task title is required.");
      return;
    }

    const previousTasks = tasks;
    const isCompletionUpdate = "status" in input;
    hasLocalWrites.current = true;
    if (isCompletionUpdate) {
      setPendingCompletionTaskIds((current) => addSetValue(current, taskId));
    } else {
      setTasks((current) => current.map((task) => (task.id === taskId ? applyOptimisticTaskUpdate(task, input) : task)));
    }

    try {
      const [updated] = await Promise.all([
        writeTask(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(input) }),
        isCompletionUpdate ? delay(320) : Promise.resolve()
      ]);
      if (updated) {
        setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
      }
    } catch {
      setTasks(previousTasks);
      setError("Unable to save task.");
    } finally {
      if (isCompletionUpdate) {
        setPendingCompletionTaskIds((current) => removeSetValue(current, taskId));
      }
    }
  }

  async function createSubtask(parentTask: Task) {
    const title = subtaskTitle.trim();
    if (!title) {
      setError("Subtask title is required.");
      return;
    }

    hasLocalWrites.current = true;

    try {
      const created = await writeTask(`/api/tasks/${parentTask.id}/subtasks`, {
        method: "POST",
        body: JSON.stringify({
          title,
          description: "",
          status: "not_started",
          priority: "medium",
          dueDate: null
        })
      });

      if (created) {
        setTasks((current) => [...current, created]);
        setExpanded(parentTask.id, true);
        setAddingSubtaskFor(null);
        setSubtaskTitle("");
      }
    } catch {
      setAddingSubtaskFor(parentTask.id);
      setSubtaskTitle(title);
      setError("Unable to save task.");
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}" and all subtasks?`)) {
      return;
    }

    const previousTasks = tasks;
    hasLocalWrites.current = true;
    setError(null);
    setTasks((current) => current.filter((item) => item.id !== task.id && item.parentTaskId !== task.id));

    try {
      await requestJson<{ error?: string }>(`/api/tasks/${task.id}`, { method: "DELETE" }, "Unable to delete task.");
    } catch (caught) {
      setTasks(previousTasks);
      setError(caught instanceof Error ? caught.message : "Unable to delete task.");
    }
  }

  async function deleteSubtask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) {
      return;
    }

    const previousTasks = tasks;
    hasLocalWrites.current = true;
    setError(null);
    setTasks((current) => current.filter((item) => item.id !== task.id));

    try {
      await requestJson<{ error?: string }>(`/api/tasks/${task.id}`, { method: "DELETE" }, "Unable to delete subtask.");
    } catch (caught) {
      setTasks(previousTasks);
      setError(caught instanceof Error ? caught.message : "Unable to delete subtask.");
    }
  }

  async function writeTask(url: string, init: RequestInit): Promise<Task | null> {
    setError(null);
    const payload = await requestJson<{ task?: Task; error?: string }>(url, init, "Unable to save task.");

    if (!payload.task) {
      throw new Error("Unable to save task.");
    }

    return payload.task;
  }

  async function requestJson<T extends { error?: string }>(url: string, init: RequestInit, fallbackError: string): Promise<T> {
    return trackSync(
      (async () => {
        const response = await fetch(url, {
          ...init,
          headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
        });
        const payload = (await response.json()) as T;

        if (!response.ok) {
          throw new Error(payload.error ?? fallbackError);
        }

        return payload;
      })()
    );
  }

  function toggleExpanded(taskId: string) {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function setExpanded(taskId: string, expanded: boolean) {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }

  function startAddSubtask(taskId: string) {
    setAddingSubtaskFor(taskId);
    setSubtaskTitle("");
  }

  return (
    <section aria-label="任务管理" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">任务管理</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">紧凑展示一级任务和子任务，点击标题、优先级或截止日期快速修改。</p>
        </div>
        <button className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setShowCompleted((value) => !value)} type="button">
          {showCompleted ? "Hide Completed" : "Show Completed"}
        </button>
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_10rem_auto]" onSubmit={createTask}>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Task title
          <input className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal text-ink outline-none focus:border-moss" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} value={form.title} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Task priority
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal text-ink outline-none focus:border-moss" onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))} value={form.priority}>
            {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Due date
          <input className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal text-ink outline-none focus:border-moss" onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} type="date" value={form.dueDate} />
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

      {!loading && topLevelTasks.length > 0 ? (
        <div aria-label="Task list" className="mt-5 overflow-hidden rounded-lg border border-slate-200" role="table">
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_4rem_6.5rem_4.5rem] items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500" role="row">
            <div aria-label="Expand" role="columnheader" />
            <div role="columnheader">Task</div>
            <div role="columnheader">Status</div>
            <div role="columnheader">Priority</div>
            <div role="columnheader">Due</div>
            <div aria-label="Actions" role="columnheader" />
          </div>
          {topLevelTasks.map((task) => {
            const children = tasks.filter((item) => item.parentTaskId === task.id);
            const expanded = expandedTaskIds.has(task.id);
            return (
              <div key={task.id} role="rowgroup">
                <TaskRow
                  canExpand={children.length > 0}
                  expanded={expanded}
                  isSubtask={false}
                  pendingCompletion={pendingCompletionTaskIds.has(task.id)}
                  onAddSubtask={startAddSubtask}
                  onDelete={deleteTask}
                  onPriorityChange={(taskId, priority) => updateTask(taskId, { priority })}
                  onStatusToggle={(taskToToggle) => updateTask(taskToToggle.id, { status: taskToToggle.status === "completed" ? "not_started" : "completed" })}
                  onTitleSave={(taskId, title) => updateTask(taskId, { title })}
                  onToggleExpanded={toggleExpanded}
                  onDueDateChange={(taskId, dueDate) => updateTask(taskId, { dueDate })}
                  progress={getTaskProgress(task, tasks)}
                  selected={selectedTaskId === task.id}
                  selectedTaskId={selectedTaskId}
                  onSelect={setSelectedTaskId}
                  task={task}
                />
                {addingSubtaskFor === task.id ? (
                  <SubtaskInput onCancel={() => setAddingSubtaskFor(null)} onCreate={() => createSubtask(task)} onTitleChange={setSubtaskTitle} parentTitle={task.title} title={subtaskTitle} />
                ) : null}
                {expanded ? children.map((child) => (
                  <TaskRow
                    canExpand={false}
                    expanded={false}
                    isSubtask={true}
                    key={child.id}
                    pendingCompletion={pendingCompletionTaskIds.has(child.id)}
                    onDelete={deleteSubtask}
                    onPriorityChange={(taskId, priority) => updateTask(taskId, { priority })}
                    onStatusToggle={(taskToToggle) => updateTask(taskToToggle.id, { status: taskToToggle.status === "completed" ? "not_started" : "completed" })}
                    onTitleSave={(taskId, title) => updateTask(taskId, { title })}
                    onDueDateChange={(taskId, dueDate) => updateTask(taskId, { dueDate })}
                    selected={selectedTaskId === child.id}
                    selectedTaskId={selectedTaskId}
                    onSelect={setSelectedTaskId}
                    task={child}
                  />
                )) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

interface TaskRowProps {
  task: Task;
  isSubtask: boolean;
  canExpand: boolean;
  expanded: boolean;
  progress?: { completed: number; total: number };
  selected: boolean;
  pendingCompletion: boolean;
  selectedTaskId: string | null;
  onToggleExpanded?: (taskId: string) => void;
  onSelect: (taskId: string) => void;
  onAddSubtask?: (taskId: string) => void;
  onTitleSave: (taskId: string, title: string) => Promise<void>;
  onStatusToggle: (task: Task) => Promise<void>;
  onPriorityChange: (taskId: string, priority: TaskPriority) => Promise<void>;
  onDueDateChange: (taskId: string, dueDate: string | null) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}

function TaskRow({ task, isSubtask, canExpand, expanded, progress, selected, pendingCompletion, selectedTaskId, onToggleExpanded, onSelect, onAddSubtask, onTitleSave, onStatusToggle, onPriorityChange, onDueDateChange, onDelete }: TaskRowProps) {
  const dueState = getTaskDueState(task);
  const rowClass = pendingCompletion
    ? "bg-emerald-50"
    : dueState === "overdue"
      ? "bg-red-50"
      : dueState === "near_due"
        ? "bg-amber-50"
        : isSubtask
          ? "bg-slate-50/60"
          : "bg-white";

  return (
    <div aria-busy={pendingCompletion} aria-selected={selected} className={`grid grid-cols-[2rem_minmax(0,1fr)_7rem_4rem_6.5rem_4.5rem] items-center gap-2 border-t border-slate-200 px-3 py-2 text-sm transition-colors duration-300 ${rowClass} ${selected ? "ring-1 ring-inset ring-moss" : ""} ${pendingCompletion ? "ring-1 ring-inset ring-emerald-200" : ""} ${task.status === "completed" ? "text-slate-400" : "text-slate-700"}`} role="row">
      <div className="flex items-center" role="cell">
        {!isSubtask && canExpand ? (
          <button aria-label={`${expanded ? "Collapse" : "Expand"} subtasks for ${task.title}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => onToggleExpanded?.(task.id)} type="button">
            {expanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
          </button>
        ) : null}
      </div>
      <div className="min-w-0" role="cell">
        <div className="flex min-w-0 items-center gap-2">
          <TaskCompletionButton onToggle={onStatusToggle} pending={pendingCompletion} task={task} />
          <EditableTitle indent={isSubtask} onSave={onTitleSave} onSelect={onSelect} selectedTaskId={selectedTaskId} task={task} />
          {!isSubtask && progress ? <span className="shrink-0 text-xs text-slate-500">{progress.completed}/{progress.total}</span> : null}
        </div>
      </div>
      <div className="truncate text-xs font-medium" role="cell">{labelFor(statusOptions, task.status)}</div>
      <div role="cell"><PrioritySelect onChange={onPriorityChange} task={task} /></div>
      <div role="cell"><DueDateCell onChange={onDueDateChange} task={task} /></div>
      <div className="flex justify-end gap-1" role="cell">
        {!isSubtask ? (
          <button aria-label={`Add subtask to ${task.title}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => onAddSubtask?.(task.id)} type="button">
            <Plus aria-hidden="true" size={14} />
          </button>
        ) : null}
        <button aria-label={`${isSubtask ? "Delete subtask" : "Delete task"} ${task.title}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50" onClick={() => void onDelete(task)} type="button">
          <Trash2 aria-hidden="true" size={14} />
        </button>
      </div>
    </div>
  );
}

function TaskCompletionButton({ task, pending, onToggle }: { task: Task; pending: boolean; onToggle: (task: Task) => Promise<void> }) {
  const completed = task.status === "completed";

  return (
    <button
      aria-label={completed ? `Reopen task ${task.title}` : `Mark task ${task.title} complete`}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${pending ? "animate-pulse border-emerald-500 bg-emerald-100" : completed ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white hover:border-emerald-500"}`}
      onClick={() => void onToggle(task)}
      type="button"
    >
      {completed ? <Check aria-hidden="true" size={10} strokeWidth={3} /> : null}
    </button>
  );
}

function EditableTitle({ task, indent, selectedTaskId, onSelect, onSave }: { task: Task; indent: boolean; selectedTaskId: string | null; onSelect: (taskId: string) => void; onSave: (taskId: string, title: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);

  useEffect(() => {
    if (!editing) setValue(task.title);
  }, [editing, task.title]);

  async function saveTitle() {
    const title = value.trim();
    if (title.length === 0) {
      setValue(task.title);
      setEditing(false);
      return;
    }

    if (title === task.title) {
      setEditing(false);
      return;
    }

    await onSave(task.id, title);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        aria-label={`Edit title for ${task.title}`}
        autoFocus
        className="h-8 min-w-0 rounded-md border border-slate-300 px-2 text-sm text-ink outline-none focus:border-moss"
        onBlur={() => { void saveTitle(); }}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setValue(task.title);
            setEditing(false);
          }
          if (event.key === "Enter") {
            void saveTitle();
          }
        }}
        value={value}
      />
    );
  }

  return (
    <button className={`min-w-0 truncate text-left text-sm ${indent ? "pl-5 font-normal text-slate-700" : "font-semibold text-ink"}`} onClick={() => {
      if (selectedTaskId === task.id) {
        setEditing(true);
        return;
      }

      onSelect(task.id);
    }} type="button">
      {task.title}
    </button>
  );
}

function PrioritySelect({ task, onChange }: { task: Task; onChange: (taskId: string, priority: TaskPriority) => Promise<void> }) {
  return (
    <label className="relative inline-flex h-8 w-9 items-center justify-center rounded-md hover:bg-slate-100">
      <span className={`pointer-events-none h-3 w-3 rounded-full ${priorityDotClass(task.priority)}`} />
      <select aria-label={`Priority for ${task.title}: ${priorityLabel(task.priority)}`} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => void onChange(task.id, event.target.value as TaskPriority)} value={task.priority}>
        {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function DueDateCell({ task, onChange }: { task: Task; onChange: (taskId: string, dueDate: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        aria-label={`Due date for ${task.title}`}
        autoFocus
        className="h-8 w-32 rounded-md border border-slate-300 px-2 text-sm text-ink outline-none focus:border-moss"
        onBlur={() => setEditing(false)}
        onChange={(event) => void onChange(task.id, event.target.value || null).then(() => setEditing(false))}
        onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }}
        type="date"
        value={task.dueDate ?? ""}
      />
    );
  }

  if (!task.dueDate) {
    return (
      <button aria-label={`Set due date for ${task.title}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setEditing(true)} type="button">
        <Calendar aria-hidden="true" size={16} />
      </button>
    );
  }

  return (
    <button aria-label={`Edit due date for ${task.title}`} className="h-8 rounded-md px-2 text-left text-xs text-slate-700 hover:bg-slate-100" onClick={() => setEditing(true)} type="button">
      {task.dueDate}
    </button>
  );
}

function SubtaskInput({ parentTitle, title, onTitleChange, onCreate, onCancel }: { parentTitle: string; title: string; onTitleChange: (value: string) => void; onCreate: () => Promise<void>; onCancel: () => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") onCancel();
    if (event.key === "Enter") void onCreate();
  }

  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_4rem_6.5rem_4.5rem] items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2" role="row">
      <div role="cell" />
      <div role="cell">
        <input aria-label={`New subtask for ${parentTitle}`} autoFocus className="ml-5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-ink outline-none focus:border-moss" onChange={(event) => onTitleChange(event.target.value)} onKeyDown={handleKeyDown} value={title} />
      </div>
      <div className="text-xs text-slate-500" role="cell">Not Started</div>
      <div role="cell"><span className="inline-block h-3 w-3 rounded-full bg-amber-500" /></div>
      <div role="cell"><Calendar aria-hidden="true" className="text-slate-400" size={16} /></div>
      <div role="cell" />
    </div>
  );
}

function labelFor<T extends string>(options: Array<{ value: T; label: string }>, value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function priorityLabel(priority: TaskPriority): string {
  return labelFor(priorityOptions, priority);
}

function priorityDotClass(priority: TaskPriority): string {
  if (priority === "high") return "bg-red-500";
  if (priority === "medium") return "bg-amber-500";
  return "bg-green-500";
}

function applyOptimisticTaskUpdate(
  task: Task,
  input: Partial<Pick<Task, "title" | "status" | "priority" | "dueDate">>
): Task {
  const now = new Date().toISOString();
  const status = input.status ?? task.status;

  return {
    ...task,
    ...input,
    status,
    updatedAt: now,
    completedAt: status === "completed" ? task.completedAt ?? now : null
  };
}

function addSetValue<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  next.add(value);
  return next;
}

function removeSetValue<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
