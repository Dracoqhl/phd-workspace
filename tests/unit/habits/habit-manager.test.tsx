import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HabitManager } from "@/components/habits/HabitManager";
import type { Habit, HabitCheckin } from "@/types/habit";

const now = "2026-05-08T08:00:00.000Z";

interface HabitListItem {
  habit: Habit;
  checkin: HabitCheckin | null;
  isCompleted: boolean;
}

function habit(overrides: Partial<Habit>): Habit {
  return {
    id: "habit_1",
    name: "Walk",
    description: "Ten minutes outside",
    icon: "shoe",
    targetCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function checkin(overrides: Partial<HabitCheckin>): HabitCheckin {
  return {
    id: "checkin_1",
    habitId: "habit_1",
    date: "2026-05-08",
    isCompleted: true,
    completedCount: 1,
    note: "",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

function mockFetch(items: HabitListItem[]) {
  const checkinCounts = new Map<string, number>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/habits" && method === "GET") {
      return Response.json({ date: "2026-05-08", habits: items });
    }

    if (url === "/api/habits" && method === "POST") {
      const body = parseBody(init);
      return Response.json({
        habit: habit({
          id: "habit_new",
          name: String(body.name),
          description: String(body.description ?? ""),
          icon: String(body.icon ?? ""),
          targetCount: Number(body.targetCount ?? 1)
        })
      }, { status: 201 });
    }

    if (url.startsWith("/api/habits/") && method === "PATCH" && !url.includes("deactivate")) {
      const id = url.split("/").at(-1) ?? "habit_1";
      const body = parseBody(init);
      const original = items.find((item) => item.habit.id === id)?.habit;
      return Response.json({
        habit: habit({
          ...original,
          ...body,
          id
        } as Partial<Habit>)
      });
    }

    if (url === "/api/habits/habit_1/deactivate" && method === "PATCH") {
      return Response.json({ habit: habit({ id: "habit_1", isActive: false }) });
    }

    if (url === "/api/habits/habit_1/checkins" && method === "POST") {
      const targetCount = items.find((item) => item.habit.id === "habit_1")?.habit.targetCount ?? 1;
      const nextCount = Math.min((checkinCounts.get("habit_1") ?? 0) + 1, targetCount);
      checkinCounts.set("habit_1", nextCount);
      return Response.json({ checkin: checkin({ habitId: "habit_1", completedCount: nextCount, isCompleted: nextCount >= targetCount }) }, { status: nextCount === 1 ? 201 : 200 });
    }

    if (url === "/api/habits/habit_1/checkins/2026-05-08" && method === "DELETE") {
      const targetCount = items.find((item) => item.habit.id === "habit_1")?.habit.targetCount ?? 1;
      const nextCount = Math.max((checkinCounts.get("habit_1") ?? targetCount) - 1, 0);
      checkinCounts.set("habit_1", nextCount);
      return Response.json({ checkin: nextCount > 0 ? checkin({ habitId: "habit_1", completedCount: nextCount, isCompleted: nextCount >= targetCount }) : null, deleted: nextCount === 0 });
    }

    throw new Error(`Unexpected request ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HabitManager", () => {
  it("renders incomplete habits before completed habits and marks completed rows", async () => {
    mockFetch([
      { habit: habit({ id: "done", name: "Done habit" }), checkin: checkin({ habitId: "done" }), isCompleted: true },
      { habit: habit({ id: "open", name: "Open habit" }), checkin: null, isCompleted: false }
    ]);

    render(<HabitManager />);

    expect(await screen.findByRole("heading", { name: "每日健康习惯" })).toHaveClass("text-base");
    expect(screen.getByText("每日 02:00 刷新")).toBeInTheDocument();
    expect(screen.queryByText(/完成后自动置底/)).not.toBeInTheDocument();
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]).getByText("Open habit")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Done habit")).toBeInTheDocument();
    expect(rows[1]).toHaveClass("text-slate-400");
    expect(within(rows[1]).getByText("Done habit")).toHaveClass("line-through");
    expect(screen.getByRole("list")).toHaveClass("rounded-list-frame");
    expect(screen.getByText("1/2 checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuenow", "1");
  });

  it("keeps the create form hidden until the panel enters edit mode", async () => {
    const fetchMock = mockFetch([]);

    render(<HabitManager />);

    expect(screen.queryByLabelText("Habit name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Daily target")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Edit habits" }));

    expect(screen.queryByLabelText("Habit icon")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Habit description")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New habit name"), { target: { value: "Morning run" } });
    fireEvent.change(screen.getByLabelText("New habit daily target"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Habit" }));

    expect(await screen.findByDisplayValue("Morning run")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Morning run", description: "", icon: "", targetCount: 3 })
      })
    );
  });

  it("reloads habits when an AI confirmation refresh event is dispatched", async () => {
    let items: HabitListItem[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/habits" && method === "GET") {
          return Response.json({ date: "2026-05-08", habits: items });
        }

        throw new Error(`Unexpected request ${method} ${url}`);
      })
    );

    render(<HabitManager />);

    expect(await screen.findByText("No active habits yet.")).toBeInTheDocument();
    items = [{ habit: habit({ id: "habit_ai", name: "AI habit" }), checkin: null, isCompleted: false }];
    window.dispatchEvent(new Event("phd-workspace:habits-refresh"));

    expect(await screen.findByText("AI habit")).toBeInTheDocument();
  });


  it("edits all habit rows in panel edit mode and saves changed targets", async () => {
    const fetchMock = mockFetch([{ habit: habit({ id: "habit_1", name: "Walk", targetCount: 2 }), checkin: null, isCompleted: false }]);

    render(<HabitManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit habits" }));

    fireEvent.change(screen.getByLabelText("Habit name for Walk"), { target: { value: "Drink water" } });
    fireEvent.blur(screen.getByLabelText("Habit name for Walk"));

    expect(await screen.findByDisplayValue("Drink water")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/habit_1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining("Drink water") })
    );

    fireEvent.change(screen.getByLabelText("Daily target for Drink water"), { target: { value: "5" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/habit_1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"targetCount":5') })
    );
  });

  it("updates a habit target from the progress fraction in normal mode", async () => {
    const fetchMock = mockFetch([{ habit: habit({ id: "habit_1", name: "Walk", targetCount: 3 }), checkin: checkin({ completedCount: 1, isCompleted: false }), isCompleted: false }]);

    render(<HabitManager />);

    expect(await screen.findByText("1/3 checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuemax", "3");

    fireEvent.click(await screen.findByRole("button", { name: "Edit daily target for Walk" }));
    fireEvent.change(screen.getByLabelText("Daily target for Walk"), { target: { value: "4" } });

    expect(await screen.findByText("1/4 checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuemax", "4");
    expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuenow", "1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/habit_1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"targetCount":4') })
    );
  });

  it("increments a multi-check habit, completes at target, then decrements on cancel", async () => {
    const fetchMock = mockFetch([
      { habit: habit({ id: "habit_1", name: "Walk", targetCount: 3 }), checkin: null, isCompleted: false },
      { habit: habit({ id: "habit_2", name: "Read" }), checkin: null, isCompleted: false }
    ]);

    render(<HabitManager />);

    const incompleteButton = await screen.findByRole("button", { name: "Mark Walk complete" });
    expect(incompleteButton).toHaveClass("rounded-full");
    expect(incompleteButton).toHaveClass("border-slate-300");

    fireEvent.click(incompleteButton);

    expect(await screen.findByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("1/4 checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuenow", "1");
    expect(fetchMock).toHaveBeenCalledWith("/api/habits/habit_1/checkins", expect.objectContaining({ method: "POST" }));

    fireEvent.click(screen.getByRole("button", { name: "Mark Walk progress" }));
    expect(await screen.findByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("2/4 checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuenow", "2");

    fireEvent.click(screen.getByRole("button", { name: "Mark Walk progress" }));

    await waitFor(() => {
      const rows = screen.getAllByRole("listitem");
      expect(within(rows[0]).getByText("Read")).toBeInTheDocument();
      expect(within(rows[1]).getByText("Walk")).toHaveClass("line-through");
      expect(within(rows[1]).getByText("3/3")).toBeInTheDocument();
      expect(screen.getByText("3/4 checked")).toBeInTheDocument();
      expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuenow", "3");
    });

    const completedButton = screen.getByRole("button", { name: "Cancel check-in for Walk" });
    expect(completedButton).toHaveClass("bg-success");
    expect(within(completedButton).getByTestId("habit-checkmark")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel check-in for Walk" }));

    await waitFor(() => {
      const rows = screen.getAllByRole("listitem");
      expect(within(rows[0]).getByText("Walk")).not.toHaveClass("line-through");
      expect(within(rows[0]).getByText("2/3")).toBeInTheDocument();
      expect(screen.getByText("2/4 checked")).toBeInTheDocument();
      expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuenow", "2");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/habit_1/checkins/2026-05-08",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("updates habit progress immediately while check-in sync is pending", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/habits" && method === "GET") {
          return Response.json({
            date: "2026-05-08",
            habits: [{ habit: habit({ id: "habit_1", name: "Walk", targetCount: 3 }), checkin: null, isCompleted: false }]
          });
        }

        if (url === "/api/habits/habit_1/checkins" && method === "POST") {
          return pending.promise;
        }

        throw new Error(`Unexpected request ${method} ${url}`);
      })
    );

    render(<HabitManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Mark Walk complete" }));

    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("1/3 checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("rounded-list-row");

    pending.resolve(Response.json({ checkin: checkin({ completedCount: 1, isCompleted: false }) }));
    await waitFor(() => expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-busy", "false"));
  });

  it("edits by clicking text and deactivates with a trash button", async () => {
    const fetchMock = mockFetch([{ habit: habit({ id: "habit_1", name: "Walk" }), checkin: null, isCompleted: false }]);

    render(<HabitManager />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit habits" }));
    fireEvent.change(screen.getByLabelText("Habit name for Walk"), { target: { value: "Evening walk" } });
    fireEvent.blur(screen.getByLabelText("Habit name for Walk"));

    expect(await screen.findByDisplayValue("Evening walk")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/habit_1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining("Evening walk") })
    );

    const deactivateButton = screen.getByRole("button", { name: "Deactivate Evening walk" });
    expect(deactivateButton).toHaveClass("text-action-muted", "hover:text-delete");
    expect(within(deactivateButton).getByTestId("habit-trash-icon")).toBeInTheDocument();
    fireEvent.click(deactivateButton);
    await waitFor(() => expect(screen.queryByText("Evening walk")).not.toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith("/api/habits/habit_1/deactivate", expect.objectContaining({ method: "PATCH" }));
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
