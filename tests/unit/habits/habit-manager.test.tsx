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
          icon: String(body.icon ?? "")
        })
      }, { status: 201 });
    }

    if (url === "/api/habits/habit_1" && method === "PATCH") {
      const body = parseBody(init);
      return Response.json({ habit: habit({ ...body, id: "habit_1" } as Partial<Habit>) });
    }

    if (url === "/api/habits/habit_1/deactivate" && method === "PATCH") {
      return Response.json({ habit: habit({ id: "habit_1", isActive: false }) });
    }

    if (url === "/api/habits/habit_1/checkins" && method === "POST") {
      return Response.json({ checkin: checkin({ habitId: "habit_1" }) }, { status: 201 });
    }

    if (url === "/api/habits/habit_1/checkins/2026-05-08" && method === "DELETE") {
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

describe("HabitManager", () => {
  it("renders incomplete habits before completed habits and marks completed rows", async () => {
    mockFetch([
      { habit: habit({ id: "done", name: "Done habit" }), checkin: checkin({ habitId: "done" }), isCompleted: true },
      { habit: habit({ id: "open", name: "Open habit" }), checkin: null, isCompleted: false }
    ]);

    render(<HabitManager />);

    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]).getByText("Open habit")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Done habit")).toBeInTheDocument();
    expect(rows[1]).toHaveClass("text-slate-400");
    expect(within(rows[1]).getByText("Done habit")).toHaveClass("line-through");
    expect(screen.getByText("1/2 checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Habit check-in progress" })).toHaveAttribute("aria-valuenow", "1");
  });

  it("creates a habit from the compact form without showing an icon column", async () => {
    const fetchMock = mockFetch([]);

    render(<HabitManager />);

    expect(screen.queryByLabelText("Habit icon")).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Habit name"), { target: { value: "Morning run" } });
    fireEvent.change(screen.getByLabelText("Habit description"), { target: { value: "20 minutes" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Habit" }));

    expect(await screen.findByText("Morning run")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Morning run", description: "20 minutes", icon: "" })
      })
    );
  });

  it("checks in and moves the habit to the end, then cancels and restores it to the front", async () => {
    const fetchMock = mockFetch([
      { habit: habit({ id: "habit_1", name: "Walk" }), checkin: null, isCompleted: false },
      { habit: habit({ id: "habit_2", name: "Read" }), checkin: null, isCompleted: false }
    ]);

    render(<HabitManager />);

    const incompleteButton = await screen.findByRole("button", { name: "Mark Walk complete" });
    expect(incompleteButton).toHaveClass("rounded-full");
    expect(incompleteButton).toHaveClass("border-slate-300");

    fireEvent.click(incompleteButton);

    await waitFor(() => {
      const rows = screen.getAllByRole("listitem");
      expect(within(rows[0]).getByText("Read")).toBeInTheDocument();
      expect(within(rows[1]).getByText("Walk")).toHaveClass("line-through");
    });

    const completedButton = screen.getByRole("button", { name: "Cancel check-in for Walk" });
    expect(completedButton).toHaveClass("bg-emerald-600");
    expect(within(completedButton).getByTestId("habit-checkmark")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel check-in for Walk" }));

    await waitFor(() => {
      const rows = screen.getAllByRole("listitem");
      expect(within(rows[0]).getByText("Walk")).not.toHaveClass("line-through");
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/habits/habit_1/checkins", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/habit_1/checkins/2026-05-08",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("edits by clicking text and deactivates with a trash button", async () => {
    const fetchMock = mockFetch([{ habit: habit({ id: "habit_1", name: "Walk" }), checkin: null, isCompleted: false }]);

    render(<HabitManager />);

    expect(screen.queryByRole("button", { name: "Edit Walk" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByText("Walk"));
    fireEvent.change(screen.getByLabelText("Edit habit name for Walk"), { target: { value: "Evening walk" } });
    fireEvent.keyDown(screen.getByLabelText("Edit habit name for Walk"), { key: "Enter" });

    expect(await screen.findByText("Evening walk")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/habit_1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining("Evening walk") })
    );

    const deactivateButton = screen.getByRole("button", { name: "Deactivate Evening walk" });
    expect(within(deactivateButton).getByTestId("habit-trash-icon")).toBeInTheDocument();
    fireEvent.click(deactivateButton);
    await waitFor(() => expect(screen.queryByText("Evening walk")).not.toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith("/api/habits/habit_1/deactivate", expect.objectContaining({ method: "PATCH" }));
  });
});
