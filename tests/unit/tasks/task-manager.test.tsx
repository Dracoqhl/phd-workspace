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
          parentTaskId: null
        })
      });
    }

    if (url === "/api/tasks/task_1/subtasks" && method === "POST") {
      const body = parseBody(init);
      return Response.json({
        task: task({
          id: "subtask_new",
          title: String(body.title),
          description: "",
          status: "not_started",
          priority: "low",
          dueDate: null,
          parentTaskId: "task_1"
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
      task({ id: "task_1" }),
      task({ id: "subtask_1", title: "Collect figures", status: "completed", parentTaskId: "task_1" }),
      task({ id: "subtask_2", title: "Revise intro", status: "not_started", parentTaskId: "task_1" })
    ]);

    render(<TaskManager />);

    expect(await screen.findByRole("columnheader", { name: "Task" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Priority" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Due" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Task" })).toHaveClass("text-center");
    expect(screen.getByRole("columnheader", { name: "Status" })).toHaveClass("text-center");
    expect(screen.getByRole("columnheader", { name: "Priority" })).toHaveClass("text-center");
    expect(screen.getByRole("columnheader", { name: "Due" })).toHaveClass("text-center");
    expect(screen.getByTestId("status-cell-task_1")).toHaveClass("justify-center");
    expect(screen.getByTestId("priority-cell-task_1")).toHaveClass("justify-center");
    expect(screen.getByTestId("due-cell-task_1")).toHaveClass("justify-center");
    expect(screen.getByRole("row", { name: /Draft dissertation chapter/ })).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.queryByText("Collect figures")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand subtasks for Draft dissertation chapter" }));

    expect(screen.getByText("Collect figures")).toBeInTheDocument();
    expect(screen.getByText("Revise intro")).toBeInTheDocument();
  });

  it("hides completed top-level tasks by default and reveals them with a toggle", async () => {
    mockFetch([
      task({ id: "active_task", title: "Active task", status: "not_started" }),
      task({ id: "done_task", title: "Done task", status: "completed", completedAt: now })
    ]);

    render(<TaskManager />);

    expect(await screen.findByText("Active task")).toBeInTheDocument();
    expect(screen.queryByText("Done task")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show Completed" }));

    expect(screen.getByText("Done task")).toBeInTheDocument();
  });

  it("creates a top-level task", async () => {
    const fetchMock = mockFetch([]);

    render(<TaskManager />);

    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Prepare committee slides" } });
    fireEvent.change(screen.getByLabelText("Task priority"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(await screen.findByText("Prepare committee slides")).toBeInTheDocument();
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
    expect(screen.getByTestId("priority-dot-task_1")).toHaveClass("bg-yellow-400");
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

    fireEvent.click(await screen.findByRole("button", { name: "Show Completed" }));
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
