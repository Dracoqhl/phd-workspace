import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function mockFetch(tasks: Task[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/tasks" && method === "GET") {
      return Response.json({ tasks });
    }

    if (url === "/api/tasks" && method === "POST") {
      return Response.json({
        task: task({
          id: "task_new",
          title: JSON.parse(String(init?.body)).title,
          description: JSON.parse(String(init?.body)).description,
          status: JSON.parse(String(init?.body)).status,
          priority: JSON.parse(String(init?.body)).priority,
          dueDate: JSON.parse(String(init?.body)).dueDate,
          parentTaskId: null
        })
      });
    }

    if (url.startsWith("/api/tasks/") && method === "PATCH") {
      const id = url.split("/").at(-1) ?? "task_1";
      const body = JSON.parse(String(init?.body)) as Partial<Task>;
      return Response.json({
        task: task({
          id,
          parentTaskId: id.startsWith("subtask") ? "task_1" : null,
          title: body.title ?? (id.startsWith("subtask") ? "Collect figures" : "Draft dissertation chapter"),
          description: body.description ?? "Write the first complete draft.",
          status: body.status ?? "in_progress",
          priority: body.priority ?? "high",
          dueDate: body.dueDate ?? "2026-05-09"
        })
      });
    }

    if (url === "/api/tasks/task_1" && method === "DELETE") {
      return Response.json({ taskId: "task_1", deletedCount: 2 });
    }

    if (url === "/api/tasks/subtask_1" && method === "DELETE") {
      return Response.json({ taskId: "subtask_1", deletedCount: 1 });
    }

    if (url === "/api/tasks/task_1/subtasks" && method === "POST") {
      return Response.json({
        task: task({
          id: "subtask_new",
          title: JSON.parse(String(init?.body)).title,
          description: "",
          status: "not_started",
          priority: "medium",
          dueDate: null,
          parentTaskId: "task_1"
        })
      });
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
  it("loads tasks and renders readable labels with child progress", async () => {
    mockFetch([
      task({ id: "task_1" }),
      task({ id: "subtask_1", title: "Collect figures", status: "completed", parentTaskId: "task_1" }),
      task({ id: "subtask_2", title: "Revise intro", status: "not_started", parentTaskId: "task_1" })
    ]);

    render(<TaskManager />);

    const card = await screen.findByRole("article", { name: "Draft dissertation chapter" });
    expect(within(card).getByText("In Progress", { selector: "span" })).toBeInTheDocument();
    expect(within(card).getByText("High", { selector: "span" })).toBeInTheDocument();
    expect(within(card).getByText("1/2 subtasks completed")).toBeInTheDocument();
    expect(within(card).getByDisplayValue("Collect figures")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Task description"), { target: { value: "Create draft deck." } });
    fireEvent.change(screen.getByLabelText("Task priority"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(await screen.findByText("Prepare committee slides")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Prepare committee slides",
          description: "Create draft deck.",
          status: "not_started",
          priority: "high",
          dueDate: null,
          parentTaskId: null
        })
      })
    );
  });

  it("updates status, creates a subtask, and deletes a task", async () => {
    const fetchMock = mockFetch([task({ id: "task_1" })]);

    render(<TaskManager />);

    const card = await screen.findByRole("article", { name: "Draft dissertation chapter" });
    fireEvent.change(within(card).getByLabelText("New subtask for Draft dissertation chapter"), {
      target: { value: "Polish abstract" }
    });
    fireEvent.click(within(card).getByRole("button", { name: "Add Subtask" }));
    expect(await within(card).findByDisplayValue("Polish abstract")).toBeInTheDocument();

    fireEvent.change(within(card).getByLabelText("Status for Draft dissertation chapter"), {
      target: { value: "completed" }
    });
    await waitFor(() => expect(screen.queryByText("Draft dissertation chapter")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Show Completed" }));
    expect(await screen.findByRole("article", { name: "Draft dissertation chapter" })).toBeInTheDocument();

    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    fireEvent.click(screen.getByRole("button", { name: "Delete Task" }));

    await waitFor(() => expect(screen.queryByText("Draft dissertation chapter")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task_1", expect.objectContaining({ method: "PATCH" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task_1/subtasks", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task_1", expect.objectContaining({ method: "DELETE" }));
  });

  it("edits top-level task and subtask content", async () => {
    const fetchMock = mockFetch([
      task({ id: "task_1" }),
      task({ id: "subtask_1", title: "Collect figures", description: "Old note", parentTaskId: "task_1" })
    ]);

    render(<TaskManager />);

    const card = await screen.findByRole("article", { name: "Draft dissertation chapter" });
    fireEvent.change(within(card).getByLabelText("Title for Draft dissertation chapter"), {
      target: { value: "Draft final dissertation chapter" }
    });
    fireEvent.change(within(card).getByLabelText("Description for Draft dissertation chapter"), {
      target: { value: "Updated chapter note." }
    });
    fireEvent.click(within(card).getByRole("button", { name: "Save Task" }));

    expect(await screen.findByRole("article", { name: "Draft final dissertation chapter" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task_1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Draft final dissertation chapter", description: "Updated chapter note." })
      })
    );

    const updatedCard = screen.getByRole("article", { name: "Draft final dissertation chapter" });
    fireEvent.change(within(updatedCard).getByLabelText("Title for Collect figures"), {
      target: { value: "Collect final figures" }
    });
    fireEvent.change(within(updatedCard).getByLabelText("Description for Collect figures"), {
      target: { value: "Updated subtask note." }
    });
    fireEvent.click(within(updatedCard).getByRole("button", { name: "Save Subtask" }));

    expect(await screen.findByDisplayValue("Collect final figures")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/subtask_1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Collect final figures", description: "Updated subtask note." })
      })
    );
  });

  it("edits subtask priority and due date, then deletes the subtask", async () => {
    const fetchMock = mockFetch([
      task({ id: "task_1" }),
      task({ id: "subtask_1", title: "Collect figures", parentTaskId: "task_1", priority: "medium", dueDate: null })
    ]);

    render(<TaskManager />);

    const card = await screen.findByRole("article", { name: "Draft dissertation chapter" });
    fireEvent.change(within(card).getByLabelText("Priority for Collect figures"), { target: { value: "low" } });
    fireEvent.change(within(card).getByLabelText("Due date for Collect figures"), { target: { value: "2026-05-12" } });

    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    fireEvent.click(within(card).getByRole("button", { name: "Delete Subtask" }));

    await waitFor(() => expect(screen.queryByDisplayValue("Collect figures")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/subtask_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ priority: "low" }) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/subtask_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ dueDate: "2026-05-12" }) })
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/subtask_1", expect.objectContaining({ method: "DELETE" }));
  });
});
