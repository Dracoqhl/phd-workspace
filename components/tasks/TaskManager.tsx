"use client";

import { Calendar, Check, ChevronDown, ChevronRight, CornerDownRight, Plus, Trash2 } from "lucide-react";
import { FormEvent, KeyboardEvent, MouseEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import { getTaskDueState, getTaskProgress } from "@/lib/domain/tasks";
import type { Task, TaskPriority, TaskStatus } from "@/types/task";

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "not_started", label: "Todo" },
  { value: "next", label: "Next" },
  { value: "in_progress", label: "Doing" },
  { value: "waiting", label: "Waiting" },
  { value: "blocked", label: "Blocked" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Done" }
];

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

const fieldControlClass = "border-field-border bg-field text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20";

const emptyForm = {
  title: "",
  priority: "low" as TaskPriority,
  dueDate: ""
};

export function TaskManager() {
  const { trackSync } = useSyncStatus();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [addingTask, setAddingTask] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskStatus, setSubtaskStatus] = useState<TaskStatus>("not_started");
  const [subtaskPriority, setSubtaskPriority] = useState<TaskPriority>("low");
  const [subtaskDueDate, setSubtaskDueDate] = useState("");
  const [pendingCompletionTaskIds, setPendingCompletionTaskIds] = useState<Set<string>>(() => new Set());
  const hasLocalWrites = useRef(false);
  const taskMutationSequences = useRef(new Map<string, number>());
  const taskTitleInputRef = useRef<HTMLInputElement>(null);
  const subtaskDraftRowRef = useRef<HTMLDivElement>(null);
  const creatingSubtaskRef = useRef(false);

  const loadTasks = useCallback(async ({ force = false, showLoading = true } = {}) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/tasks");
      const payload = (await response.json()) as { tasks?: Task[]; error?: string };

      if (!response.ok || !payload.tasks) {
        throw new Error(payload.error ?? "Unable to load tasks.");
      }

      if (force || !hasLocalWrites.current) {
        setTasks(payload.tasks);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load tasks.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialTasks() {
      if (active) {
        await loadTasks();
      }
    }

    void loadInitialTasks();

    return () => {
      active = false;
    };
  }, [loadTasks]);

  useEffect(() => {
    function refreshTasks() {
      void loadTasks({ force: true, showLoading: false });
    }

    window.addEventListener("phd-workspace:tasks-refresh", refreshTasks);
    return () => window.removeEventListener("phd-workspace:tasks-refresh", refreshTasks);
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedTaskId) return;

    function clearSelectionOnOutsideClick(event: globalThis.MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-task-row]")) return;
      setSelectedTaskId(null);
    }

    document.addEventListener("click", clearSelectionOnOutsideClick);
    return () => document.removeEventListener("click", clearSelectionOnOutsideClick);
  }, [selectedTaskId]);

  useEffect(() => {
    if (addingTask) {
      taskTitleInputRef.current?.focus();
    }
  }, [addingTask]);

  useEffect(() => {
    if (!addingSubtaskFor) return;

    function submitSubtaskOnOutsideClick(event: globalThis.MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (subtaskDraftRowRef.current?.contains(target)) return;

      const parentTask = tasks.find((task) => task.id === addingSubtaskFor);
      if (!parentTask) return;

      if (subtaskTitle.trim().length === 0) {
        cancelSubtaskDraft();
        return;
      }

      void createSubtask(parentTask);
    }

    document.addEventListener("click", submitSubtaskOnOutsideClick);
    return () => document.removeEventListener("click", submitSubtaskOnOutsideClick);
  }, [addingSubtaskFor, subtaskDueDate, subtaskPriority, subtaskStatus, subtaskTitle, tasks]);

  const topLevelTasks = useMemo(() => {
    return tasks.filter(
      (task) =>
        task.parentTaskId === null &&
        (showCompleted || task.status !== "completed" || pendingCompletionTaskIds.has(task.id))
    );
  }, [pendingCompletionTaskIds, showCompleted, tasks]);

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
        setAddingTask(false);
      }
    } catch {
      setError("Unable to save task.");
    }
  }

  async function updateTask(
    taskId: string,
    input: Partial<Pick<Task, "title" | "status" | "priority" | "dueDate">>,
    options: { completionFeedback?: boolean } = {}
  ) {
    if ("title" in input && input.title?.trim().length === 0) {
      setError("Task title is required.");
      return;
    }

    const previousTasks = tasks;
    const sequence = nextTaskSequence(taskId);
    const useCompletionFeedback = options.completionFeedback === true;
    hasLocalWrites.current = true;
    setTasks((current) => current.map((task) => (task.id === taskId ? applyOptimisticTaskUpdate(task, input) : task)));

    if (useCompletionFeedback) {
      setPendingCompletionTaskIds((current) => addSetValue(current, taskId));
    }

    try {
      const [updated] = await Promise.all([
        writeTask(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(input) }),
        useCompletionFeedback ? delay(120) : Promise.resolve()
      ]);
      if (updated && isLatestTaskSequence(taskId, sequence)) {
        setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
      }
    } catch {
      if (isLatestTaskSequence(taskId, sequence)) {
        setTasks(previousTasks);
        setError("Unable to save task.");
      }
    } finally {
      if (useCompletionFeedback && isLatestTaskSequence(taskId, sequence)) {
        setPendingCompletionTaskIds((current) => removeSetValue(current, taskId));
      }
    }
  }

  function nextTaskSequence(taskId: string): number {
    const next = (taskMutationSequences.current.get(taskId) ?? 0) + 1;
    taskMutationSequences.current.set(taskId, next);
    return next;
  }

  function isLatestTaskSequence(taskId: string, sequence: number): boolean {
    return taskMutationSequences.current.get(taskId) === sequence;
  }

  async function createSubtask(parentTask: Task) {
    if (creatingSubtaskRef.current) return;

    const title = subtaskTitle.trim();
    if (!title) {
      setError("Subtask title is required.");
      return;
    }

    creatingSubtaskRef.current = true;
    hasLocalWrites.current = true;

    try {
      const created = await writeTask(`/api/tasks/${parentTask.id}/subtasks`, {
        method: "POST",
        body: JSON.stringify({
          title,
          description: "",
          status: subtaskStatus,
          priority: subtaskPriority,
          dueDate: subtaskDueDate || null
        })
      });

      if (created) {
        setTasks((current) => [...current, created]);
        setExpanded(parentTask.id, true);
        setAddingSubtaskFor(null);
        setSubtaskTitle("");
        setSubtaskStatus("not_started");
        setSubtaskPriority("low");
        setSubtaskDueDate("");
      }
    } catch {
      setAddingSubtaskFor(parentTask.id);
      setSubtaskTitle(title);
      setError("Unable to save task.");
    } finally {
      creatingSubtaskRef.current = false;
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
    setSubtaskStatus("not_started");
    setSubtaskPriority("low");
    setSubtaskDueDate("");
  }

  function cancelSubtaskDraft() {
    setAddingSubtaskFor(null);
    setSubtaskTitle("");
    setSubtaskStatus("not_started");
    setSubtaskPriority("low");
    setSubtaskDueDate("");
  }

  function cancelTaskDraft() {
    setForm(emptyForm);
    setAddingTask(false);
    setError(null);
  }

  return (
    <section
      aria-label="任务管理"
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="-mx-5 flex flex-col gap-3 border-b border-slate-200 px-5 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">任务管理</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-ink px-2.5 text-xs font-semibold text-white hover:bg-slate-700" onClick={() => setAddingTask(true)} type="button">
            <Plus aria-hidden="true" size={14} />
            新建任务
          </button>
          <button className="h-8 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={() => setShowCompleted((value) => !value)} type="button">
            {showCompleted ? "隐藏完成" : "展示全部"}
          </button>
        </div>
      </div>

      {addingTask ? (
        <form className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_10rem_auto_auto]" onSubmit={createTask}>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Task title
            <input ref={taskTitleInputRef} className={`h-10 rounded-md border px-3 text-sm font-normal ${fieldControlClass}`} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} value={form.title} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Task priority
            <select className={`h-10 rounded-md border px-3 text-sm font-normal ${fieldControlClass}`} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))} value={form.priority}>
              {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Due date
            <input className={`h-10 rounded-md border px-3 text-sm font-normal ${fieldControlClass}`} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} type="date" value={form.dueDate} />
          </label>
          <button className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
            <Plus aria-hidden="true" size={16} />
            Create Task
          </button>
          <button className="mt-6 inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={cancelTaskDraft} type="button">
            Cancel
          </button>
        </form>
      ) : null}

      {error ? <p className="mt-4 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-text" role="alert">{error}</p> : null}
      {loading ? <p className="mt-5 text-sm text-slate-600">Loading tasks...</p> : null}

      {!loading && topLevelTasks.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600">No active tasks yet.</p>
      ) : null}

      {!loading && topLevelTasks.length > 0 ? (
        <div aria-label="Task list" className="task-table -mx-5 -mb-5" role="table">
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_6.5rem_4.5rem_5.5rem_4.5rem] items-center gap-2 border-b border-slate-200 px-5 py-1.5 text-[11px] font-medium text-slate-500" role="row">
            <div aria-label="Expand" className="text-center" role="columnheader" />
            <div className="text-center" role="columnheader">任务</div>
            <div className="text-center" role="columnheader">状态</div>
            <div className="text-center" role="columnheader">优先级</div>
            <div className="text-center" role="columnheader">截止</div>
            <div aria-label="Actions" className="text-center" role="columnheader" />
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
                  onStatusChange={(taskId, status) => updateTask(taskId, { status })}
                  onStatusToggle={(taskToToggle) => updateTask(taskToToggle.id, { status: taskToToggle.status === "completed" ? "not_started" : "completed" }, { completionFeedback: true })}
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
                  <SubtaskInput
                    draftRowRef={subtaskDraftRowRef}
                    dueDate={subtaskDueDate}
                    onCancel={cancelSubtaskDraft}
                    onCreate={() => createSubtask(task)}
                    onDueDateChange={setSubtaskDueDate}
                    onPriorityChange={setSubtaskPriority}
                    onStatusChange={setSubtaskStatus}
                    onTitleChange={setSubtaskTitle}
                    parentTitle={task.title}
                    priority={subtaskPriority}
                    status={subtaskStatus}
                    title={subtaskTitle}
                  />
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
                    onStatusChange={(taskId, status) => updateTask(taskId, { status })}
                    onStatusToggle={(taskToToggle) => updateTask(taskToToggle.id, { status: taskToToggle.status === "completed" ? "not_started" : "completed" }, { completionFeedback: true })}
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
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>;
  onPriorityChange: (taskId: string, priority: TaskPriority) => Promise<void>;
  onDueDateChange: (taskId: string, dueDate: string | null) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}

function TaskRow({ task, isSubtask, canExpand, expanded, progress, selected, pendingCompletion, selectedTaskId, onToggleExpanded, onSelect, onAddSubtask, onTitleSave, onStatusToggle, onStatusChange, onPriorityChange, onDueDateChange, onDelete }: TaskRowProps) {
  const rowClass = pendingCompletion
    ? "bg-success-soft"
    : task.status === "completed"
      ? isSubtask ? "bg-task-child" : "bg-task-parent"
      : isSubtask ? "bg-task-child" : "bg-task-parent";
  const hierarchyMarkerClass = isSubtask ? "text-muted" : "";

  function selectFromRow(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button,input,select,label")) return;
    onSelect(task.id);
  }

  return (
    <div aria-busy={pendingCompletion} aria-selected={selected} className={`grid grid-cols-[2rem_minmax(0,1fr)_6.5rem_4.5rem_5.5rem_4.5rem] items-center gap-2 border-b border-slate-200 px-5 py-2 text-sm transition-colors duration-150 ${rowClass} ${selected ? "ring-1 ring-inset ring-moss" : ""} ${pendingCompletion ? "ring-1 ring-inset ring-success" : ""} ${task.status === "completed" ? "text-slate-400" : "text-slate-700"}`} data-task-row="true" onClick={selectFromRow} role="row">
      <div className="flex items-center" role="cell">
        {!isSubtask && canExpand ? (
          <button aria-label={`${expanded ? "Collapse" : "Expand"} subtasks for ${task.title}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => onToggleExpanded?.(task.id)} type="button">
            {expanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
          </button>
        ) : null}
      </div>
      <div className="min-w-0" role="cell">
        <div className="flex min-w-0 items-center gap-2">
          {isSubtask ? (
            <span aria-hidden="true" className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${hierarchyMarkerClass}`} data-testid={`subtask-marker-${task.id}`}>
              <CornerDownRight size={14} strokeWidth={2.2} />
            </span>
          ) : null}
          <TaskCompletionButton onToggle={onStatusToggle} pending={pendingCompletion} task={task} />
          <EditableTitle indent={isSubtask} onSave={onTitleSave} onSelect={onSelect} selectedTaskId={selectedTaskId} task={task} />
          {!isSubtask && progress ? <span className="shrink-0 text-xs text-slate-500">{progress.completed}/{progress.total}</span> : null}
        </div>
      </div>
      <div className="flex justify-center" data-testid={`status-cell-${task.id}`} role="cell"><StatusSelect onChange={onStatusChange} task={task} /></div>
      <div className="flex justify-center" data-testid={`priority-cell-${task.id}`} role="cell"><PrioritySelect onChange={onPriorityChange} task={task} /></div>
      <div className="flex justify-center" data-testid={`due-cell-${task.id}`} role="cell"><DueDateCell onChange={onDueDateChange} task={task} /></div>
      <div className="flex justify-end gap-1" role="cell">
        {!isSubtask ? (
          <button aria-label={`Add subtask to ${task.title}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => onAddSubtask?.(task.id)} type="button">
            <Plus aria-hidden="true" size={14} />
          </button>
        ) : null}
        <button aria-label={`${isSubtask ? "Delete subtask" : "Delete task"} ${task.title}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-action-muted hover:bg-delete-soft hover:text-delete" onClick={() => void onDelete(task)} type="button">
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
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${pending ? "border-success bg-success-soft text-success-text" : completed ? "border-success bg-success text-white" : "border-slate-300 bg-white hover:border-success"}`}
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
        className={`h-8 min-w-0 rounded-md border px-2 text-sm ${fieldControlClass}`}
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
  const priority = priorityOptions.find((option) => option.value === task.priority) ?? priorityOptions[1];

  return (
    <label className="relative inline-flex h-7 w-10 items-center justify-center rounded-md hover:bg-slate-100">
      <span className={`h-3 w-3 rounded-full ${priorityDotClass(task.priority)}`} data-testid={`priority-dot-${task.id}`} />
      <select
        aria-label={`Priority for ${task.title}: ${priority.label}`}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        onChange={(event) => void onChange(task.id, event.target.value as TaskPriority)}
        value={task.priority}
      >
        {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function StatusSelect({ task, onChange }: { task: Task; onChange: (taskId: string, status: TaskStatus) => Promise<void> }) {
  return (
    <select
      aria-label={`Status for ${task.title}`}
      className={`h-7 w-[6.25rem] appearance-none rounded-full border px-2 text-center text-xs font-semibold outline-none focus:border-moss ${statusSelectClass(task.status)}`}
      onChange={(event) => void onChange(task.id, event.target.value as TaskStatus)}
      value={task.status}
    >
      {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function DueDateCell({ task, onChange }: { task: Task; onChange: (taskId: string, dueDate: string | null) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = task.dueDate ? "Edit due date" : "Set due date";
  const dueState = getTaskDueState(task);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === "function") {
      input.showPicker();
    }
  }

  const content = task.dueDate ? formatShortDate(task.dueDate) : <Calendar aria-hidden="true" size={15} />;
  const dueClass = dueState === "overdue"
    ? "font-bold text-due-over"
    : dueState === "near_due"
      ? "font-bold text-due-near"
      : "text-slate-700 hover:border-moss";

  return (
    <span className="relative inline-flex">
      <button aria-label={`${label} for ${task.title}`} className={`inline-flex h-7 w-[5.25rem] items-center justify-center rounded-md border border-field-border bg-field px-2 text-xs font-medium transition-colors ${dueClass}`} onClick={openPicker} type="button">
        {content}
      </button>
      <input
        aria-label={`Due date for ${task.title}`}
        className="absolute left-0 top-0 h-px w-px opacity-0"
        onChange={(event) => void onChange(task.id, event.target.value || null)}
        ref={inputRef}
        tabIndex={-1}
        type="date"
        value={task.dueDate ?? ""}
      />
    </span>
  );
}

function SubtaskInput({ parentTitle, title, status, priority, dueDate, draftRowRef, onTitleChange, onStatusChange, onPriorityChange, onDueDateChange, onCreate, onCancel }: { parentTitle: string; title: string; status: TaskStatus; priority: TaskPriority; dueDate: string; draftRowRef: RefObject<HTMLDivElement>; onTitleChange: (value: string) => void; onStatusChange: (value: TaskStatus) => void; onPriorityChange: (value: TaskPriority) => void; onDueDateChange: (value: string) => void; onCreate: () => Promise<void>; onCancel: () => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") onCancel();
    if (event.key === "Enter") void onCreate();
  }

  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_6.5rem_4.5rem_5.5rem_4.5rem] items-center gap-2 border-b border-slate-200 bg-task-child px-5 py-2" ref={draftRowRef} role="row">
      <div role="cell" />
      <div className="min-w-0 pl-5 pr-1" role="cell">
        <input aria-label={`New subtask for ${parentTitle}`} autoFocus className={`h-8 w-full rounded-md border px-2 text-sm ${fieldControlClass}`} onChange={(event) => onTitleChange(event.target.value)} onKeyDown={handleKeyDown} value={title} />
      </div>
      <div className="flex justify-center" role="cell">
        <select aria-label={`New subtask status for ${parentTitle}`} className={`h-7 w-[6.25rem] appearance-none rounded-full border px-2 text-center text-xs font-semibold outline-none focus:border-moss ${statusSelectClass(status)}`} onChange={(event) => onStatusChange(event.target.value as TaskStatus)} value={status}>
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="flex justify-center" role="cell">
        <label className="relative inline-flex h-7 w-10 items-center justify-center rounded-md hover:bg-slate-100">
          <span className={`h-3 w-3 rounded-full ${priorityDotClass(priority)}`} />
          <select aria-label={`New subtask priority for ${parentTitle}`} className="absolute inset-0 cursor-pointer appearance-none opacity-0" onChange={(event) => onPriorityChange(event.target.value as TaskPriority)} value={priority}>
            {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex justify-center" role="cell">
        <NewSubtaskDueDateInput dueDate={dueDate} onDueDateChange={onDueDateChange} parentTitle={parentTitle} />
      </div>
      <div role="cell" />
    </div>
  );
}

function NewSubtaskDueDateInput({ parentTitle, dueDate, onDueDateChange }: { parentTitle: string; dueDate: string; onDueDateChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === "function") {
      input.showPicker();
    }
  }

  return (
    <span className="relative inline-flex">
      <button aria-label={`Set due date for new subtask under ${parentTitle}`} className="inline-flex h-7 w-[5.25rem] items-center justify-center rounded-md border border-field-border bg-field px-2 text-xs font-medium text-slate-700 transition-colors hover:border-moss" onClick={openPicker} type="button">
        {dueDate ? formatShortDate(dueDate) : <Calendar aria-hidden="true" size={15} />}
      </button>
      <input
        aria-label={`New subtask due date for ${parentTitle}`}
        className="absolute left-0 top-0 h-px w-px opacity-0"
        onChange={(event) => onDueDateChange(event.target.value)}
        ref={inputRef}
        tabIndex={-1}
        type="date"
        value={dueDate}
      />
    </span>
  );
}

function priorityDotClass(priority: TaskPriority): string {
  if (priority === "high") return "bg-priority-high";
  if (priority === "medium") return "bg-priority-medium";
  return "bg-priority-low";
}

function statusSelectClass(status: TaskStatus): string {
  if (status === "next") return "border-status-next bg-status-next-soft text-status-next-text";
  if (status === "in_progress") return "border-status-doing bg-status-doing-soft text-status-doing-text";
  if (status === "waiting") return "border-status-waiting bg-status-waiting-soft text-status-waiting-text";
  if (status === "blocked") return "border-status-blocked bg-status-blocked-soft text-status-blocked-text";
  if (status === "paused") return "border-status-paused bg-status-paused-soft text-status-paused-text";
  if (status === "completed") return "border-status-done bg-status-done-soft text-status-done-text";
  return "border-status-todo bg-status-todo-soft text-status-todo-text";
}

function formatShortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${month}-${day}`;
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
