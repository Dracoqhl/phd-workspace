# Compact Task Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current large task cards with a compact hierarchical task table that supports expandable subtasks, inline title editing, priority swatches, and due-date icon/date editing.

**Architecture:** Keep the existing protected task API and JSON data model unchanged. Refactor `components/tasks/TaskManager.tsx` into a compact list-oriented client component, with small internal row helpers for title editing, priority editing, and due-date editing. Update `tests/unit/tasks/task-manager.test.tsx` first so the new UI behavior is locked by tests before implementation.

**Tech Stack:** Next.js 14 App Router, React 18 client components, Tailwind CSS, lucide-react icons, Vitest, Testing Library.

---

## File Structure

- Modify `components/tasks/TaskManager.tsx`: replace large card layout with compact hierarchical rows; add expand/collapse state; add inline title editing; add priority swatch editing; add due-date icon/date editing.
- Modify `tests/unit/tasks/task-manager.test.tsx`: rewrite expectations from card/panel behavior to compact table behavior.
- Modify `Readme.md`: update development status if implementation changes user-visible task UI description.
- Modify `architecture.md`: update task UI description from large manager to compact hierarchical table.

No API route files should change for this redesign.

## Task 1: Compact Table Rendering And Expand Collapse

**Files:**
- Modify: `tests/unit/tasks/task-manager.test.tsx`
- Modify: `components/tasks/TaskManager.tsx`

- [ ] **Step 1: Write failing tests for compact headers and collapsed subtasks**

Replace the current first rendering test in `tests/unit/tasks/task-manager.test.tsx` with expectations like:

```tsx
it("renders compact task rows and keeps subtasks collapsed until expanded", async () => {
  mockFetch([
    task({ id: "task_1" }),
    task({ id: "subtask_1", title: "Collect figures", status: "completed", parentTaskId: "task_1" }),
    task({ id: "subtask_2", title: "Revise intro", status: "not_started", parentTaskId: "task_1" })
  ]);

  render(<TaskManager />);

  expect(await screen.findByRole("columnheader", { name: "Task" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Priority" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Due" })).toBeInTheDocument();

  expect(screen.getByRole("row", { name: /Draft dissertation chapter/ })).toBeInTheDocument();
  expect(screen.getByText("1/2")).toBeInTheDocument();
  expect(screen.queryByText("Collect figures")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Expand subtasks for Draft dissertation chapter" }));

  expect(screen.getByText("Collect figures")).toBeInTheDocument();
  expect(screen.getByText("Revise intro")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: FAIL because the current UI renders large articles and does not expose compact table headers or expand/collapse controls.

- [ ] **Step 3: Implement compact table structure**

In `components/tasks/TaskManager.tsx`:

- Add `ChevronDown`, `ChevronRight`, and `Calendar` imports from `lucide-react`.
- Replace the large `TaskCard` layout with table-like rows using semantic roles:

```tsx
<div role="table" aria-label="Task list" className="mt-5 overflow-hidden rounded-lg border border-slate-200">
  <div role="row" className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_4rem_6rem] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
    <div role="columnheader" aria-label="Expand" />
    <div role="columnheader">Task</div>
    <div role="columnheader">Status</div>
    <div role="columnheader">Priority</div>
    <div role="columnheader">Due</div>
  </div>
  {topLevelTasks.map((task) => (
    <TaskRow key={task.id} task={task} tasks={tasks} />
  ))}
</div>
```

- Add `expandedTaskIds` state:

```tsx
const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
```

- Add a toggle helper:

```tsx
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
```

- Render only children for expanded parents.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: the compact rendering test passes. Other tests may still fail because later behavior has not been rewritten.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add components/tasks/TaskManager.tsx tests/unit/tasks/task-manager.test.tsx
git commit -m "feat: render compact task rows"
```

## Task 2: Inline Title Editing

**Files:**
- Modify: `tests/unit/tasks/task-manager.test.tsx`
- Modify: `components/tasks/TaskManager.tsx`

- [ ] **Step 1: Write failing tests for Enter save and Escape cancel**

Add tests:

```tsx
it("saves a title edit with Enter", async () => {
  const fetchMock = mockFetch([task({ id: "task_1" })]);

  render(<TaskManager />);

  fireEvent.click(await screen.findByText("Draft dissertation chapter"));
  const input = screen.getByLabelText("Edit title for Draft dissertation chapter");
  fireEvent.change(input, { target: { value: "Draft final chapter" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(await screen.findByText("Draft final chapter")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/tasks/task_1",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Draft final chapter" }) })
  );
});

it("cancels a title edit with Escape", async () => {
  const fetchMock = mockFetch([task({ id: "task_1" })]);

  render(<TaskManager />);

  fireEvent.click(await screen.findByText("Draft dissertation chapter"));
  const input = screen.getByLabelText("Edit title for Draft dissertation chapter");
  fireEvent.change(input, { target: { value: "Do not save" } });
  fireEvent.keyDown(input, { key: "Escape" });

  expect(screen.getByText("Draft dissertation chapter")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith("/api/tasks/task_1", expect.objectContaining({ method: "PATCH" }));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: FAIL because task titles are not inline editable in the compact row yet.

- [ ] **Step 3: Implement `EditableTitle` helper**

Add an internal component in `TaskManager.tsx`:

```tsx
function EditableTitle({ task, indent, onSave }: { task: Task; indent: boolean; onSave: (taskId: string, title: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);

  useEffect(() => {
    if (!editing) {
      setValue(task.title);
    }
  }, [editing, task.title]);

  if (editing) {
    return (
      <input
        aria-label={`Edit title for ${task.title}`}
        autoFocus
        className="h-8 min-w-0 rounded-md border border-slate-300 px-2 text-sm text-ink outline-none focus:border-moss"
        onBlur={() => {
          setValue(task.title);
          setEditing(false);
        }}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setValue(task.title);
            setEditing(false);
          }
          if (event.key === "Enter") {
            const title = value.trim();
            if (title.length > 0) {
              void onSave(task.id, title).then(() => setEditing(false));
            }
          }
        }}
        value={value}
      />
    );
  }

  return (
    <button
      className={`min-w-0 truncate text-left text-sm ${indent ? "pl-5 font-normal text-slate-700" : "font-semibold text-ink"}`}
      onClick={() => setEditing(true)}
      type="button"
    >
      {task.title}
    </button>
  );
}
```

Wire it to `updateTask(taskId, { title })`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: title editing tests pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add components/tasks/TaskManager.tsx tests/unit/tasks/task-manager.test.tsx
git commit -m "feat: edit task titles inline"
```

## Task 3: Priority Swatch Editing

**Files:**
- Modify: `tests/unit/tasks/task-manager.test.tsx`
- Modify: `components/tasks/TaskManager.tsx`

- [ ] **Step 1: Write failing test for priority swatch editing**

Add test:

```tsx
it("updates priority from the compact swatch control", async () => {
  const fetchMock = mockFetch([task({ id: "task_1", priority: "high" })]);

  render(<TaskManager />);

  const priority = await screen.findByLabelText("Priority for Draft dissertation chapter: High");
  fireEvent.change(priority, { target: { value: "low" } });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/tasks/task_1",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ priority: "low" }) })
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: FAIL because the priority control is not yet a compact swatch/select.

- [ ] **Step 3: Implement `PrioritySelect` helper**

Add helper functions:

```tsx
function priorityLabel(priority: TaskPriority): string {
  return labelFor(priorityOptions, priority);
}

function priorityDotClass(priority: TaskPriority): string {
  if (priority === "high") return "bg-red-500";
  if (priority === "medium") return "bg-amber-500";
  return "bg-green-500";
}
```

Add compact select:

```tsx
function PrioritySelect({ task, onChange }: { task: Task; onChange: (taskId: string, priority: TaskPriority) => Promise<void> }) {
  return (
    <label className="relative inline-flex h-8 w-9 items-center justify-center">
      <span className={`pointer-events-none h-3 w-3 rounded-full ${priorityDotClass(task.priority)}`} />
      <select
        aria-label={`Priority for ${task.title}: ${priorityLabel(task.priority)}`}
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(event) => void onChange(task.id, event.target.value as TaskPriority)}
        value={task.priority}
      >
        {priorityOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: priority swatch test passes.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add components/tasks/TaskManager.tsx tests/unit/tasks/task-manager.test.tsx
git commit -m "feat: edit task priority from swatch"
```

## Task 4: Due Date Icon And Inline Date Editing

**Files:**
- Modify: `tests/unit/tasks/task-manager.test.tsx`
- Modify: `components/tasks/TaskManager.tsx`

- [ ] **Step 1: Write failing tests for calendar icon and date save**

Add tests:

```tsx
it("shows a calendar icon when due date is empty and saves a selected date", async () => {
  const fetchMock = mockFetch([task({ id: "task_1", dueDate: null })]);

  render(<TaskManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Set due date for Draft dissertation chapter" }));
  const input = screen.getByLabelText("Due date for Draft dissertation chapter");
  fireEvent.change(input, { target: { value: "2026-05-18" } });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/tasks/task_1",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ dueDate: "2026-05-18" }) })
  );
});

it("clicks an existing due date to edit it", async () => {
  const fetchMock = mockFetch([task({ id: "task_1", dueDate: "2026-05-09" })]);

  render(<TaskManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Edit due date for Draft dissertation chapter" }));
  fireEvent.change(screen.getByLabelText("Due date for Draft dissertation chapter"), { target: { value: "2026-05-20" } });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/tasks/task_1",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ dueDate: "2026-05-20" }) })
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: FAIL because due date cells are not yet icon/date-edit controls.

- [ ] **Step 3: Implement `DueDateCell` helper**

Add helper:

```tsx
function DueDateCell({ task, onChange }: { task: Task; onChange: (taskId: string, dueDate: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        aria-label={`Due date for ${task.title}`}
        autoFocus
        className="h-8 w-32 rounded-md border border-slate-300 px-2 text-sm text-ink outline-none focus:border-moss"
        onBlur={() => setEditing(false)}
        onChange={(event) => {
          void onChange(task.id, event.target.value || null).then(() => setEditing(false));
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
        type="date"
        value={task.dueDate ?? ""}
      />
    );
  }

  if (!task.dueDate) {
    return (
      <button
        aria-label={`Set due date for ${task.title}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        onClick={() => setEditing(true)}
        type="button"
      >
        <Calendar aria-hidden="true" size={16} />
      </button>
    );
  }

  return (
    <button
      aria-label={`Edit due date for ${task.title}`}
      className="h-8 rounded-md px-2 text-left text-sm text-slate-700 hover:bg-slate-100"
      onClick={() => setEditing(true)}
      type="button"
    >
      {task.dueDate}
    </button>
  );
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: due-date tests pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add components/tasks/TaskManager.tsx tests/unit/tasks/task-manager.test.tsx
git commit -m "feat: edit task due dates inline"
```

## Task 5: Compact Create/Delete And Subtask Creation

**Files:**
- Modify: `tests/unit/tasks/task-manager.test.tsx`
- Modify: `components/tasks/TaskManager.tsx`

- [ ] **Step 1: Rewrite existing create/delete/subtask tests for compact rows**

Update tests so they no longer search for `article` cards. Use row/table queries and compact controls:

```tsx
it("creates a subtask and expands the parent row", async () => {
  mockFetch([task({ id: "task_1" })]);

  render(<TaskManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Add subtask to Draft dissertation chapter" }));
  fireEvent.change(screen.getByLabelText("New subtask for Draft dissertation chapter"), { target: { value: "Polish abstract" } });
  fireEvent.keyDown(screen.getByLabelText("New subtask for Draft dissertation chapter"), { key: "Enter" });

  expect(await screen.findByText("Polish abstract")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify failures**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: FAIL where old controls have not yet been replaced by compact row actions.

- [ ] **Step 3: Implement compact row actions**

- Keep the top-level create form above the table, but reduce it to title, priority, due date, and `Create Task`.
- Add a small plus button on top-level rows:

```tsx
<button aria-label={`Add subtask to ${task.title}`} ...>
  <Plus aria-hidden="true" size={14} />
</button>
```

- When clicked, show a single inline input below that parent row.
- Enter creates the subtask and adds the parent ID to `expandedTaskIds`.
- Keep delete as small `Trash2` icon buttons with accessible labels.

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
pnpm test tests/unit/tasks/task-manager.test.tsx
```

Expected: all task manager tests pass.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add components/tasks/TaskManager.tsx tests/unit/tasks/task-manager.test.tsx
git commit -m "feat: compact task row actions"
```

## Task 6: Documentation And Full Verification

**Files:**
- Modify: `Readme.md`
- Modify: `architecture.md`

- [ ] **Step 1: Update docs**

Update `Readme.md` task UI status to say the task module uses a compact hierarchical list with inline title, priority, and due-date editing.

Update `architecture.md` `components/tasks/TaskManager.tsx` description to say compact hierarchical table instead of task cards or panels.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm lint
pnpm test
pnpm exec tsc --noEmit --pretty false
APP_PASSWORD=change-me SESSION_SECRET=dev-session-secret DATA_DIR=/tmp/phd-workspace-data pnpm build
```

Expected:

- `pnpm lint`: exits 0.
- `pnpm test`: all tests pass.
- `pnpm exec tsc --noEmit --pretty false`: exits 0.
- `pnpm build`: compiles successfully and lists `/`, auth routes, and task routes.

- [ ] **Step 3: Commit docs and verification-ready state**

Run:

```bash
git add Readme.md architecture.md
git commit -m "docs: document compact task manager"
```

## Self-Review

- Spec coverage: The plan covers four-column compact layout, expand/collapse, inline title editing, priority swatch editing, due-date icon/date editing with lucide `Calendar`, read-only status, compact create/delete, documentation, and full verification.
- Placeholder scan: No `TBD`, `TODO`, or deferred unspecified implementation steps remain.
- Type consistency: The plan uses existing `Task`, `TaskPriority`, `TaskStatus`, `updateTask`, and `/api/tasks/:id` APIs consistently.
