"use client";

import { Check, Pencil, Plus, Power, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";

import { sortHabitListItems } from "@/lib/domain/habits";
import type { Habit, HabitCheckin, HabitListItem } from "@/types/habit";

const emptyForm = {
  icon: "",
  name: "",
  description: ""
};

export function HabitManager() {
  const [date, setDate] = useState("");
  const [habits, setHabits] = useState<HabitListItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [restoredHabitId, setRestoredHabitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHabits() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/habits");
        const payload = (await response.json()) as { date?: string; habits?: HabitListItem[]; error?: string };

        if (!response.ok || !payload.date || !payload.habits) {
          throw new Error(payload.error ?? "Unable to load habits.");
        }

        if (active) {
          setDate(payload.date);
          setHabits(payload.habits);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load habits.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadHabits();

    return () => {
      active = false;
    };
  }, []);

  const sortedHabits = useMemo(() => sortHabitListItems(habits, restoredHabitId), [habits, restoredHabitId]);

  async function createHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();

    if (!name) {
      setError("Habit name is required.");
      return;
    }

    const created = await writeHabit("/api/habits", {
      method: "POST",
      body: JSON.stringify({ name, description: form.description, icon: form.icon })
    });

    if (created) {
      setHabits((current) => [...current, { habit: created, checkin: null, isCompleted: false }]);
      setForm(emptyForm);
    }
  }

  function startEdit(item: HabitListItem) {
    setEditingHabitId(item.habit.id);
    setEditForm({ icon: item.habit.icon, name: item.habit.name, description: item.habit.description });
  }

  async function saveEdit(item: HabitListItem) {
    const name = editForm.name.trim();
    if (!name) {
      setError("Habit name is required.");
      return;
    }

    const updated = await writeHabit(`/api/habits/${item.habit.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, description: editForm.description, icon: editForm.icon })
    });

    if (updated) {
      setHabits((current) => current.map((habit) => (habit.habit.id === updated.id ? { ...habit, habit: updated } : habit)));
      setEditingHabitId(null);
    }
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>, item: HabitListItem) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveEdit(item);
    }

    if (event.key === "Escape") {
      setEditingHabitId(null);
    }
  }

  async function deactivateHabit(item: HabitListItem) {
    setError(null);
    const response = await fetch(`/api/habits/${item.habit.id}/deactivate`, { method: "PATCH" });
    const payload = (await response.json()) as { habit?: Habit; error?: string };

    if (!response.ok || !payload.habit) {
      setError(payload.error ?? "Unable to deactivate habit.");
      return;
    }

    setHabits((current) => current.filter((habit) => habit.habit.id !== item.habit.id));
  }

  async function toggleCheckin(item: HabitListItem) {
    setError(null);

    if (item.isCompleted) {
      const response = await fetch(`/api/habits/${item.habit.id}/checkins/${date}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Unable to cancel habit check-in.");
        return;
      }

      setRestoredHabitId(item.habit.id);
      setHabits((current) =>
        current.map((habit) =>
          habit.habit.id === item.habit.id ? { ...habit, checkin: null, isCompleted: false } : habit
        )
      );
      return;
    }

    const response = await fetch(`/api/habits/${item.habit.id}/checkins`, { method: "POST" });
    const payload = (await response.json()) as { checkin?: HabitCheckin; error?: string };

    if (!response.ok || !payload.checkin) {
      setError(payload.error ?? "Unable to complete habit check-in.");
      return;
    }

    setRestoredHabitId(null);
    setHabits((current) =>
      current.map((habit) =>
        habit.habit.id === item.habit.id ? { ...habit, checkin: payload.checkin!, isCompleted: true } : habit
      )
    );
  }

  async function writeHabit(url: string, init: RequestInit): Promise<Habit | null> {
    setError(null);
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
    });
    const payload = (await response.json()) as { habit?: Habit; error?: string };

    if (!response.ok || !payload.habit) {
      setError(payload.error ?? "Unable to save habit.");
      return null;
    }

    return payload.habit;
  }

  return (
    <section aria-label="每日健康习惯" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-base font-semibold text-ink">每日健康习惯</h2>
          <p className="mt-1 text-xs text-slate-500">每日 02:00 刷新；完成后自动置底。</p>
        </div>
        {date ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{date}</span> : null}
      </div>

      <form className="mt-3 grid gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={createHabit}>
        <label className="sr-only" htmlFor="habit-icon">Habit icon</label>
        <input id="habit-icon" aria-label="Habit icon" className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-moss" onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} placeholder="icon" value={form.icon} />
        <label className="sr-only" htmlFor="habit-name">Habit name</label>
        <input id="habit-name" aria-label="Habit name" className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-moss" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Habit" value={form.name} />
        <label className="sr-only" htmlFor="habit-description">Habit description</label>
        <input id="habit-description" aria-label="Habit description" className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-moss" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" value={form.description} />
        <button className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-ink px-3 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
          <Plus aria-hidden="true" size={15} />
          Add Habit
        </button>
      </form>

      {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-slate-600">Loading habits...</p> : null}

      {!loading && sortedHabits.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600">No active habits yet.</p>
      ) : null}

      {!loading && sortedHabits.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {sortedHabits.map((item) => {
            const isEditing = editingHabitId === item.habit.id;
            const rowClass = item.isCompleted ? "bg-slate-50 text-slate-400" : "bg-white text-slate-700";

            return (
              <li className={`grid gap-2 px-3 py-2 text-sm sm:grid-cols-[2rem_3.5rem_minmax(0,1fr)_7rem] sm:items-center ${rowClass}`} key={item.habit.id}>
                <button aria-label={item.isCompleted ? `Cancel check-in for ${item.habit.name}` : `Mark ${item.habit.name} complete`} className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${item.isCompleted ? "border-slate-300 bg-white text-slate-400" : "border-moss text-moss hover:bg-emerald-50"}`} onClick={() => void toggleCheckin(item)} type="button">
                  {item.isCompleted ? <X aria-hidden="true" size={15} /> : <Check aria-hidden="true" size={15} />}
                </button>

                {isEditing ? (
                  <input aria-label={`Edit habit icon for ${item.habit.name}`} className="h-8 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-moss" onChange={(event) => setEditForm((current) => ({ ...current, icon: event.target.value }))} onKeyDown={(event) => handleEditKeyDown(event, item)} value={editForm.icon} />
                ) : (
                  <span className="truncate text-xs font-semibold uppercase tracking-normal text-slate-500">{item.habit.icon || "habit"}</span>
                )}

                {isEditing ? (
                  <div className="grid gap-1 sm:grid-cols-2">
                    <input aria-label={`Edit habit name for ${item.habit.name}`} className="h-8 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-moss" onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} onKeyDown={(event) => handleEditKeyDown(event, item)} value={editForm.name} />
                    <input aria-label={`Edit habit description for ${item.habit.name}`} className="h-8 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-moss" onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} onKeyDown={(event) => handleEditKeyDown(event, item)} value={editForm.description} />
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${item.isCompleted ? "line-through" : ""}`}>{item.habit.name}</p>
                    {item.habit.description ? <p className={`truncate text-xs ${item.isCompleted ? "line-through" : "text-slate-500"}`}>{item.habit.description}</p> : null}
                  </div>
                )}

                <div className="flex items-center gap-1 sm:justify-end">
                  {isEditing ? (
                    <button className="h-8 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={() => void saveEdit(item)} type="button">Save</button>
                  ) : (
                    <button aria-label={`Edit ${item.habit.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => startEdit(item)} type="button">
                      <Pencil aria-hidden="true" size={14} />
                    </button>
                  )}
                  <button aria-label={`Deactivate ${item.habit.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => void deactivateHabit(item)} type="button">
                    <Power aria-hidden="true" size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
