"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";

import { sortHabitListItems } from "@/lib/domain/habits";
import type { Habit, HabitCheckin, HabitListItem } from "@/types/habit";

const emptyForm = {
  name: "",
  targetCount: "1"
};

export function HabitManager() {
  const [date, setDate] = useState("");
  const [habits, setHabits] = useState<HabitListItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
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
  const completedCount = habits.filter((item) => item.isCompleted).length;
  const totalCount = habits.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  async function createHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();

    if (!name) {
      setError("Habit name is required.");
      return;
    }

    const created = await writeHabit("/api/habits", {
      method: "POST",
      body: JSON.stringify({ name, description: "", icon: "", targetCount: Number(form.targetCount) })
    });

    if (created) {
      setHabits((current) => [...current, { habit: created, checkin: null, isCompleted: false }]);
      setForm(emptyForm);
    }
  }

  function startEdit(item: HabitListItem) {
    setEditingHabitId(item.habit.id);
    setEditName(item.habit.name);
  }

  async function saveEdit(item: HabitListItem) {
    const name = editName.trim();
    if (!name) {
      setError("Habit name is required.");
      return;
    }

    const updated = await writeHabit(`/api/habits/${item.habit.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, description: item.habit.description, icon: item.habit.icon, targetCount: item.habit.targetCount })
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

  function handleHabitTextClick(item: HabitListItem) {
    if (selectedHabitId === item.habit.id) {
      startEdit(item);
      return;
    }

    setSelectedHabitId(item.habit.id);
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
      const payload = (await response.json()) as { checkin?: HabitCheckin | null; error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Unable to cancel habit check-in.");
        return;
      }

      setRestoredHabitId(item.habit.id);
      setHabits((current) =>
        current.map((habit) =>
          habit.habit.id === item.habit.id
            ? { ...habit, checkin: payload.checkin ?? null, isCompleted: (payload.checkin?.completedCount ?? 0) >= habit.habit.targetCount }
            : habit
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
        habit.habit.id === item.habit.id
          ? { ...habit, checkin: payload.checkin!, isCompleted: payload.checkin!.completedCount >= habit.habit.targetCount }
          : habit
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
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">每日健康习惯</h2>
            <p className="mt-1 text-xs text-slate-500">每日 02:00 刷新；完成后自动置底。</p>
          </div>
          {date ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{date}</span> : null}
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{completedCount}/{totalCount} checked</span>
            <span>{progressPercent}%</span>
          </div>
          <div aria-label="Habit check-in progress" aria-valuemax={totalCount} aria-valuemin={0} aria-valuenow={completedCount} className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]" onSubmit={createHabit}>
        <label className="sr-only" htmlFor="habit-name">Habit name</label>
        <input id="habit-name" aria-label="Habit name" className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-moss" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Habit" value={form.name} />
        <label className="sr-only" htmlFor="habit-target">Daily target</label>
        <select id="habit-target" aria-label="Daily target" className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-moss" onChange={(event) => setForm((current) => ({ ...current, targetCount: event.target.value }))} value={form.targetCount}>
          {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
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
            const isSelected = selectedHabitId === item.habit.id;
            const rowClass = item.isCompleted ? "bg-slate-50 text-slate-400" : "bg-white text-slate-700";
            const completedCount = item.checkin?.completedCount ?? 0;
            const progressLabel = `${completedCount}/${item.habit.targetCount}`;

            return (
              <li aria-selected={isSelected} className={`grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1.5rem_minmax(0,1fr)_3rem_2.5rem] sm:items-center ${rowClass} ${isSelected ? "ring-1 ring-inset ring-moss bg-emerald-50/50" : ""}`} key={item.habit.id}>
                <button aria-label={item.isCompleted ? `Cancel check-in for ${item.habit.name}` : completedCount > 0 ? `Mark ${item.habit.name} progress` : `Mark ${item.habit.name} complete`} className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${item.isCompleted ? "border-emerald-600 bg-emerald-600 text-white" : completedCount > 0 ? "border-emerald-500 bg-emerald-100 text-emerald-700" : "border-slate-300 bg-white hover:border-emerald-500"}`} onClick={() => void toggleCheckin(item)} type="button">
                  {item.isCompleted ? <Check aria-hidden="true" data-testid="habit-checkmark" size={13} strokeWidth={3} /> : null}
                </button>

                {isEditing ? (
                  <input aria-label={`Edit habit name for ${item.habit.name}`} autoFocus className="h-8 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-moss" onBlur={() => void saveEdit(item)} onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => handleEditKeyDown(event, item)} value={editName} />
                ) : (
                  <button className="min-w-0 text-left" onClick={() => handleHabitTextClick(item)} type="button">
                    <p className={`truncate font-medium ${item.isCompleted ? "line-through" : ""}`}>{item.habit.name}</p>
                  </button>
                )}

                <span className={`text-xs font-medium ${item.isCompleted ? "line-through" : "text-slate-500"}`}>{progressLabel}</span>

                <div className="flex items-center gap-1 sm:justify-end">
                  <button aria-label={`Deactivate ${item.habit.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => void deactivateHabit(item)} type="button">
                    <Trash2 aria-hidden="true" data-testid="habit-trash-icon" size={14} />
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
