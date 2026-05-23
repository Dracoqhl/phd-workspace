import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskManager } from "@/components/tasks/TaskManager";
import type { Task } from "@/types/task";

const now = "2026-05-08T08:00:00.000Z";

function task(overrides: Partial<Task>): Task {
  return {
    id: "task_1",
    title: "Draft dissertation chapter",
    description: "Write the first complete draft.",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-05-09",
    parentTaskId: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides
  };
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

function mockFetch(tasks: Task[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/tasks" && method === "GET") {
      return Response.json({ tasks });
    }

    if (url === "/api/tasks" && method === "POST") {
      const body = parseBody(init);
      return Response.json({
        task: task({
          id: "task_new",
          title: String(body.title),
          description: String(body.description ?? ""),
          status: "not_started",
          priority: body.priority as Task["priority"],
          dueDate: (body.dueDate as string | null) ?? null,
          parentTaskId: null,
          sortOrder: tasks.filter((item) => item.parentTaskId === null).length
        })
      });
    }

    if (url === "/api/tasks/reorder" && method === "PATCH") {
      const body = parseBody(init);
      const parentTaskId = (body.parentTaskId as string | null) ?? null;
      const orderedIds = body.orderedIds as string[];
      const orderById = new Map(orderedIds.map((id, index) => [id, index]));
      return Response.json({
        tasks: tasks
          .map((item) => {
            const sortOrder = orderById.get(item.id);
            return item.parentTaskId === parentTaskId && sortOrder !== undefined ? { ...item, sortOrder } : item;
          })
          .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
      });
    }

    if (url === "/api/tasks/task_1/subtasks" && method === "POST") {
      const body = parseBody(init);
      return Response.json({
        task: task({
          id: "subtask_new",
          title: String(body.title),
          description: "",
          status: body.status as Task["status"],
          priority: body.priority as Task["priority"],
          dueDate: (body.dueDate as string | null) ?? null,
          parentTaskId: "task_1",
          sortOrder: tasks.filter((item) => item.parentTaskId === "task_1").length
        })
      });
    }

    if (url.startsWith("/api/tasks/") && method === "PATCH") {
      const id = url.split("/").at(-1) ?? "task_1";
      const body = parseBody(init) as Partial<Task>;
      const original = tasks.find((item) => item.id === id);
      return Response.json({
        task: task({
          id,
          parentTaskId: original?.parentTaskId ?? (id.startsWith("subtask") ? "task_1" : null),
          title: body.title ?? original?.title ?? (id.startsWith("subtask") ? "Collect figures" : "Draft dissertation chapter"),
          description: body.description ?? original?.description ?? "Write the first complete draft.",
          status: body.status ?? original?.status ?? "in_progress",
          priority: body.priority ?? original?.priority ?? "high",
          dueDate: body.dueDate === undefined ? original?.dueDate ?? "2026-05-09" : body.dueDate
        })
      });
    }

    if (url === "/api/tasks/task_1" && method === "DELETE") {
      return Response.json({ deleted: true });
    }

    if (url === "/api/tasks/subtask_1" && method === "DELETE") {
      return Response.json({ deleted: true });
    }

    throw new Error(`Unexpected request ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaskManager", () => {
  it("renders compact task rows and keeps subtasks collapsed until expanded", async () => {
    mockFetch([
      task({ id: "task_1", dueDate: null }),
      task({ id: "subtask_1", title: "Collect figures", status: "completed", parentTaskId: "task_1", dueDate: null }),
      task({ id: "subtask_2", title: "Revise intro", status: "not_started", parentTaskId: "task_1", dueDate: null })
    ]);

    render(<TaskManager />);

    expect(await screen.findByRole("table", { name: "Task list" })).not.toHaveClass("rounded-list-frame");
    expect(await screen.findByRole("columnheader", { name: "任务" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "优先级" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "截止" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "任务" })).toHaveClass("text-center");
    expect(screen.getByRole("columnheader", { name: "状态" })).toHaveClass("text-center");
    expect(screen.getByRole("columnheader", { name: "优先级" })).toHaveClass("text-center");
    expect(screen.getByRole("columnheader", { name: "截止" })).toHaveClass("text-center");
    expect(screen.getByTestId("status-cell-task_1")).toHaveClass("justify-center");
    expect(screen.getByTestId("priority-cell-task_1")).toHaveClass("justify-center");
    expect(screen.getByTestId("due-cell-task_1")).toHaveClass("justify-center");
    expect(screen.getByRole("row", { name: /Draft dissertation chapter/ })).toHaveClass("bg-task-parent");
    expect(screen.getByRole("row", { name: /Draft dissertation chapter/ })).not.toHaveClass("hover:bg-task-row-hover");
    expect(screen.getByRole("button", { name: "Delete task Draft dissertation chapter" })).toHaveClass("text-action-muted", "hover:text-delete");
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.queryByText("Collect figures")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand subtasks for Draft dissertation chapter" }));

    expect(screen.getByText("Collect figures")).toBeInTheDocument();
    expect(screen.getByText("Revise intro")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Revise intro/ })).toHaveClass("bg-task-child");
    expect(screen.getByTestId("subtask-marker-subtask_2")).toHaveClass("text-muted");
    expect(screen.getByRole("button", { name: "Delete subtask Collect figures" })).toHaveClass("text-action-muted", "hover:text-delete");
  });

  it("uses neutral row backgrounds while keeping priority dots semantic", async () => {
    mockFetch([
      task({ id: "low_task", title: "Low task", priority: "low", dueDate: null }),
      task({ id: "medium_task", title: "Medium task", priority: "medium", dueDate: null }),
      task({ id: "high_task", title: "High task", priority: "high", dueDate: null }),
      task({ id: "subtask_1", title: "Child task", priority: "low", parentTaskId: "high_task", dueDate: null })
    ]);

    render(<TaskManager />);

    expect(await screen.findByRole("row", { name: /Low task/ })).toHaveClass("bg-task-parent");
    expect(screen.getByRole("row", { name: /Medium task/ })).toHaveClass("bg-task-parent");
    expect(screen.getByRole("row", { name: /High task/ })).toHaveClass("bg-task-parent");

    fireEvent.click(screen.getByRole("button", { name: "Expand subtasks for High task" }));
    expect(screen.getByRole("row", { name: /Child task/ })).toHaveClass("bg-task-child");
    expect(screen.getByTestId("subtask-marker-subtask_1")).toHaveClass("text-muted");
    expect(screen.getByTestId("priority-dot-subtask_1")).toHaveClass("bg-priority-low");
  });

  it("keeps due urgency out of the task row background", async () => {
    const nearDueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    mockFetch([
      task({ id: "overdue_high", title: "Overdue high", priority: "high", dueDate: "2000-01-01" }),
      task({ id: "near_low", title: "Near low", priority: "low", dueDate: nearDueDate })
    ]);

    render(<TaskManager />);

    const overdueRow = await screen.findByRole("row", { name: /Overdue high/ });
    const nearRow = screen.getByRole("row", { name: /Near low/ });
    expect(overdueRow).toHaveClass("bg-task-parent");
    expect(overdueRow).not.toHaveClass("bg-due-over-soft");
    expect(nearRow).toHaveClass("bg-task-parent");
    expect(nearRow).not.toHaveClass("bg-due-near-soft");
    expect(screen.getByRole("button", { name: "Edit due date for Overdue high" })).toHaveClass("font-bold", "text-due-over");
    expect(screen.getByRole("button", { name: "Edit due date for Overdue high" })).not.toHaveClass("bg-due-over-soft");
    expect(screen.getByRole("button", { name: "Edit due date for Near low" })).toHaveClass("font-bold", "text-due-near");
    expect(screen.getByRole("button", { name: "Edit due date for Near low" })).not.toHaveClass("bg-due-near-soft");
  });

  it("hides completed top-level tasks by default and reveals them with a toggle", async () => {
    mockFetch([
      task({ id: "active_task", title: "Active task", status: "not_started" }),
      task({ id: "done_task", title: "Done task", status: "completed", completedAt: now })
    ]);

    render(<TaskManager />);

    expect(await screen.findByText("Active task")).toBeInTheDocument();
    expect(screen.queryByText("Done task")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展示全部" }));

    expect(screen.getByText("Done task")).toBeInTheDocument();
  });

  it("keeps top-level task creation collapsed until requested", async () => {
    mockFetch([]);

    render(<TaskManager />);

    expect(await screen.findByRole("button", { name: "新建任务" })).toBeInTheDocument();
    expect(screen.queryByText("紧凑展示一级任务和子任务，点击标题、优先级或截止日期快速修改。")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建任务" }));

    await waitFor(() => expect(screen.getByLabelText("Task title")).toHaveFocus());
  });

  it("creates a top-level task", async () => {
    const fetchMock = mockFetch([]);

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "新建任务" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Prepare committee slides" } });
    fireEvent.change(screen.getByLabelText("Task priority"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(await screen.findByText("Prepare committee slides")).toBeInTheDocument();
    expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Prepare committee slides",
          description: "",
          status: "not_started",
          priority: "high",
          dueDate: null,
          parentTaskId: null
        })
      })
    );
  });

  it("uses low priority as the default for new tasks", async () => {
    const fetchMock = mockFetch([]);

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "新建任务" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Default priority task" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(await screen.findByText("Default priority task")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"priority":"low"')
      })
    );
  });

  it("reorders top-level tasks with the drag handle", async () => {
    const fetchMock = mockFetch([
      task({ id: "task_1", title: "First task", sortOrder: 0 }),
      task({ id: "task_2", title: "Second task", sortOrder: 1 })
    ]);

    render(<TaskManager />);

    const dragButton = await screen.findByRole("button", { name: "拖动任务 Second task" });
    const targetRow = screen.getByRole("row", { name: /First task/ });
    expect(dragButton).not.toHaveClass("hover:bg-slate-100");

    fireEvent.dragStart(dragButton);
    fireEvent.dragOver(targetRow);
    expect(targetRow).toHaveAttribute("data-drop-placement", "before");
    expect(targetRow).toHaveClass("before:bg-moss");
    fireEvent.drop(targetRow);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/reorder",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ parentTaskId: null, orderedIds: ["task_2", "task_1"] })
        })
      );
    });
  });

  it("reorders subtasks only within the same parent", async () => {
    const fetchMock = mockFetch([
      task({ id: "task_1", title: "Parent task", sortOrder: 0 }),
      task({ id: "subtask_1", title: "First child", parentTaskId: "task_1", sortOrder: 0 }),
      task({ id: "subtask_2", title: "Second child", parentTaskId: "task_1", sortOrder: 1 })
    ]);

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Expand subtasks for Parent task" }));
    const targetRow = screen.getByRole("row", { name: /First child/ });
    fireEvent.dragStart(screen.getByRole("button", { name: "拖动子任务 Second child" }));
    fireEvent.dragOver(targetRow);
    expect(targetRow).toHaveAttribute("data-drop-placement", "before");
    fireEvent.drop(targetRow);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/reorder",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ parentTaskId: "task_1", orderedIds: ["subtask_2", "subtask_1"] })
        })
      );
    });
  });

  it("reloads tasks when an AI confirmation refresh event is dispatched", async () => {
    let tasks = [task({ id: "task_1", title: "Existing task" })];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/tasks" && method === "GET") {
        return Response.json({ tasks });
      }

      throw new Error(`Unexpected request ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TaskManager />);

    expect(await screen.findByText("Existing task")).toBeInTheDocument();
    tasks = [task({ id: "task_new", title: "AI generated task", status: "not_started" })];
    window.dispatchEvent(new Event("phd-workspace:tasks-refresh"));

    expect(await screen.findByText("AI generated task")).toBeInTheDocument();
  });

  it("selects a task row on first click, then edits title on second click", async () => {
    const fetchMock = mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    const title = await screen.findByText("Draft dissertation chapter");
    fireEvent.click(title);

    expect(screen.getByRole("row", { name: /Draft dissertation chapter/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("row", { name: /Draft dissertation chapter/ })).toHaveClass("bg-task-parent", "ring-moss");
    expect(screen.getByRole("row", { name: /Draft dissertation chapter/ })).not.toHaveClass("bg-task-priority-high-selected");
    expect(screen.queryByLabelText("Edit title for Draft dissertation chapter")).not.toBeInTheDocument();

    fireEvent.click(title);
    const input = screen.getByLabelText("Edit title for Draft dissertation chapter");
    fireEvent.change(input, { target: { value: "Draft final chapter" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Draft final chapter")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Draft final chapter" }) })
    );
  });

  it("selects a task row from empty row space without opening inline edit", async () => {
    mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    const row = await screen.findByRole("row", { name: /Draft dissertation chapter/ });
    fireEvent.click(row);

    expect(row).toHaveAttribute("aria-selected", "true");
    expect(row).toHaveClass("bg-task-parent", "ring-moss");
    expect(screen.queryByLabelText("Edit title for Draft dissertation chapter")).not.toBeInTheDocument();
  });

  it("clears task row selection when clicking outside task rows", async () => {
    mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    const row = await screen.findByRole("row", { name: /Draft dissertation chapter/ });
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByLabelText("任务管理"));
    expect(row).toHaveAttribute("aria-selected", "false");
    expect(row).not.toHaveClass("ring-moss");
    expect(row).toHaveClass("bg-task-parent");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "true");
    fireEvent.click(document.body);
    expect(row).toHaveAttribute("aria-selected", "false");
  });

  it("saves a title edit when focus leaves the input", async () => {
    const fetchMock = mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    const title = await screen.findByText("Draft dissertation chapter");
    fireEvent.click(title);
    fireEvent.click(title);
    const input = screen.getByLabelText("Edit title for Draft dissertation chapter");
    fireEvent.change(input, { target: { value: "Blur saved chapter" } });
    fireEvent.blur(input);

    expect(await screen.findByText("Blur saved chapter")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Blur saved chapter" }) })
    );
  });

  it("cancels a title edit with Escape", async () => {
    const fetchMock = mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    const title = await screen.findByText("Draft dissertation chapter");
    fireEvent.click(title);
    fireEvent.click(title);
    const input = screen.getByLabelText("Edit title for Draft dissertation chapter");
    fireEvent.change(input, { target: { value: "Do not save" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByText("Draft dissertation chapter")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/tasks/task_1", expect.objectContaining({ method: "PATCH" }));
  });

  it("updates priority from the compact dot control", async () => {
    const fetchMock = mockFetch([task({ id: "task_1", priority: "medium" })]);

    render(<TaskManager />);

    const priority = await screen.findByLabelText("Priority for Draft dissertation chapter: Medium");
    expect(screen.getByTestId("priority-dot-task_1")).toHaveClass("bg-priority-medium");
    fireEvent.change(priority, { target: { value: "low" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ priority: "low" }) })
    );
  });

  it("updates status from the colored status control", async () => {
    const fetchMock = mockFetch([task({ id: "task_1", status: "in_progress" })]);

    render(<TaskManager />);

    const status = await screen.findByLabelText("Status for Draft dissertation chapter");
    expect(status).toHaveClass("appearance-none");
    fireEvent.change(status, { target: { value: "blocked" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "blocked" }) })
    );
    expect(await screen.findByText("Blocked")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Draft dissertation chapter/ })).toHaveAttribute("aria-busy", "false");
  });

  it("marks a top-level task complete from the compact row control", async () => {
    const fetchMock = mockFetch([task({ id: "task_1", status: "in_progress" })]);

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Mark task Draft dissertation chapter complete" }));

    await waitFor(() => expect(screen.queryByText("Draft dissertation chapter")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "completed" }) })
    );
  });

  it("updates task completion immediately while save sync is pending", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/tasks" && method === "GET") {
          return Response.json({ tasks: [task({ id: "task_1", status: "in_progress" })] });
        }

        if (url === "/api/tasks/task_1" && method === "PATCH") {
          return pending.promise;
        }

        throw new Error(`Unexpected request ${method} ${url}`);
      })
    );

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Mark task Draft dissertation chapter complete" }));

    const row = screen.getByRole("row", { name: /Draft dissertation chapter/ });
    expect(row).toHaveAttribute("aria-busy", "true");
    expect(row).toHaveTextContent("Done");
    expect(screen.getByRole("button", { name: "Reopen task Draft dissertation chapter" })).toBeInTheDocument();

    pending.resolve(Response.json({ task: task({ id: "task_1", status: "completed", completedAt: now }) }));
    await waitFor(() => expect(screen.queryByText("Draft dissertation chapter")).not.toBeInTheDocument());
  });

  it("reopens a completed top-level task from the compact row control", async () => {
    const fetchMock = mockFetch([task({ id: "task_1", status: "completed", completedAt: now })]);

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "展示全部" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reopen task Draft dissertation chapter" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "not_started" }) })
    );
  });

  it("shows a calendar icon when due date is empty and saves a selected date", async () => {
    const fetchMock = mockFetch([task({ id: "task_1", dueDate: null })]);
    const showPicker = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Set due date for Draft dissertation chapter" }));
    expect(showPicker).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Due date for Draft dissertation chapter"), {
      target: { value: "2026-05-18" }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ dueDate: "2026-05-18" }) })
    );
  });

  it("clicks an existing due date to edit it", async () => {
    const fetchMock = mockFetch([task({ id: "task_1", dueDate: "2026-05-09" })]);
    const showPicker = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit due date for Draft dissertation chapter" }));
    expect(showPicker).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Due date for Draft dissertation chapter"), {
      target: { value: "2026-05-20" }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ dueDate: "2026-05-20" }) })
    );
  });

  it("creates a subtask and expands the parent row", async () => {
    const fetchMock = mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Add subtask to Draft dissertation chapter" }));
    const input = screen.getByLabelText("New subtask for Draft dissertation chapter");
    fireEvent.change(input, { target: { value: "Polish abstract" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Polish abstract")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1/subtasks",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("creates a filled subtask when clicking outside the draft row", async () => {
    const fetchMock = mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Add subtask to Draft dissertation chapter" }));
    fireEvent.change(screen.getByLabelText("New subtask for Draft dissertation chapter"), { target: { value: "Check references" } });
    fireEvent.click(document.body);

    expect(await screen.findByText("Check references")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1/subtasks",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("creates a subtask with editable status, priority, and due date", async () => {
    const fetchMock = mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Add subtask to Draft dissertation chapter" }));
    fireEvent.change(screen.getByLabelText("New subtask for Draft dissertation chapter"), { target: { value: "Run robustness check" } });
    fireEvent.change(screen.getByLabelText("New subtask status for Draft dissertation chapter"), { target: { value: "next" } });
    fireEvent.change(screen.getByLabelText("New subtask priority for Draft dissertation chapter"), { target: { value: "medium" } });
    fireEvent.change(screen.getByLabelText("New subtask due date for Draft dissertation chapter"), { target: { value: "2026-05-24" } });
    fireEvent.keyDown(screen.getByLabelText("New subtask for Draft dissertation chapter"), { key: "Enter" });

    expect(await screen.findByText("Run robustness check")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1/subtasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Run robustness check",
          description: "",
          status: "next",
          priority: "medium",
          dueDate: "2026-05-24"
        })
      })
    );
  });

  it("opens the native date picker from the new subtask due control", async () => {
    mockFetch([task({ id: "task_1" })]);
    const showPicker = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;

    render(<TaskManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Add subtask to Draft dissertation chapter" }));
    fireEvent.click(screen.getByRole("button", { name: "Set due date for new subtask under Draft dissertation chapter" }));

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("deletes a task and deletes a visible subtask", async () => {
    const fetchMock = mockFetch([
      task({ id: "task_1" }),
      task({ id: "subtask_1", title: "Collect figures", parentTaskId: "task_1" })
    ]);

    render(<TaskManager />);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    fireEvent.click(await screen.findByRole("button", { name: "Expand subtasks for Draft dissertation chapter" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete subtask Collect figures" }));
    await waitFor(() => expect(screen.queryByText("Collect figures")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete task Draft dissertation chapter" }));
    await waitFor(() => expect(screen.queryByText("Draft dissertation chapter")).not.toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/subtask_1", expect.objectContaining({ method: "DELETE" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task_1", expect.objectContaining({ method: "DELETE" }));
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
