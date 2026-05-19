"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import { sortHabitListItems } from "@/lib/domain/habits";
import type { Habit, HabitCheckin, HabitListItem } from "@/types/habit";

const emptyForm = {
  name: "",
  targetCount: "1"
};

const targetOptions = [1, 2, 3, 4, 5];
const fieldControlClass = "border-field-border bg-field text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20 disabled:opacity-60";

export function HabitManager() {
  const { trackSync } = useSyncStatus();
  const [date, setDate] = useState("");
  const [habits, setHabits] = useState<HabitListItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [isEditingPanel, setIsEditingPanel] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [restoredHabitId, setRestoredHabitId] = useState<string | null>(null);
  const [pendingCheckinHabitIds, setPendingCheckinHabitIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const checkinMutationSequences = useRef(new Map<string, number>());

  const loadHabits = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/habits");
      const payload = (await response.json()) as { date?: string; habits?: HabitListItem[]; error?: string };

      if (!response.ok || !payload.date || !payload.habits) {
        throw new Error(payload.error ?? "Unable to load habits.");
      }

      setDate(payload.date);
      setHabits(payload.habits);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load habits.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadHabits();
  }, [loadHabits]);

  useEffect(() => {
    function refreshHabits() {
      void loadHabits({ showLoading: false });
    }

    window.addEventListener("phd-workspace:habits-refresh", refreshHabits);
    return () => window.removeEventListener("phd-workspace:habits-refresh", refreshHabits);
  }, [loadHabits]);

  const sortedHabits = useMemo(() => {
    const sortInput = habits.map((item) =>
      pendingCheckinHabitIds.has(item.habit.id) ? { ...item, isCompleted: false } : item
    );
    const sortedIds = sortHabitListItems(sortInput, restoredHabitId).map((item) => item.habit.id);
    const itemsById = new Map(habits.map((item) => [item.habit.id, item]));

    return sortedIds.map((id) => itemsById.get(id)).filter((item): item is HabitListItem => Boolean(item));
  }, [habits, pendingCheckinHabitIds, restoredHabitId]);
  const checkedCount = habits.reduce((sum, item) => sum + (item.checkin?.completedCount ?? 0), 0);
  const targetTotal = habits.reduce((sum, item) => sum + item.habit.targetCount, 0);
  const progressPercent = targetTotal > 0 ? Math.round((checkedCount / targetTotal) * 100) : 0;

  async function createHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();

    if (!name) {
      setError("Habit name is required.");
      return;
    }

    const previousHabits = habits;
    const previousForm = form;
    const temporaryHabit = createOptimisticHabit(name, Number(form.targetCount));

    setHabits((current) => [...current, { habit: temporaryHabit, checkin: null, isCompleted: false }]);

    try {
      const created = await writeHabit("/api/habits", {
        method: "POST",
        body: JSON.stringify({ name, description: "", icon: "", targetCount: Number(form.targetCount) })
      });

      if (created) {
        setHabits((current) =>
          current.map((item) => (item.habit.id === temporaryHabit.id ? { habit: created, checkin: null, isCompleted: false } : item))
        );
        setForm(emptyForm);
      }
    } catch {
      setHabits(previousHabits);
      setForm(previousForm);
    }
  }

  async function updateHabit(item: HabitListItem, input: Partial<Pick<Habit, "name" | "targetCount">>) {
    const name = input.name?.trim() ?? item.habit.name;

    if (!name) {
      setError("Habit name is required.");
      return;
    }

    const targetCount = input.targetCount ?? item.habit.targetCount;
    const previousHabits = habits;
    const optimisticHabit = { ...item.habit, name, targetCount };

    setHabits((current) =>
      current.map((habitItem) =>
        habitItem.habit.id === item.habit.id
          ? { ...habitItem, habit: optimisticHabit, isCompleted: (habitItem.checkin?.completedCount ?? 0) >= targetCount }
          : habitItem
      )
    );

    try {
      const updated = await writeHabit(`/api/habits/${item.habit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description: item.habit.description,
          icon: item.habit.icon,
          targetCount
        })
      });

      if (updated) {
        setHabits((current) =>
          current.map((habitItem) =>
            habitItem.habit.id === updated.id
              ? { ...habitItem, habit: updated, isCompleted: (habitItem.checkin?.completedCount ?? 0) >= updated.targetCount }
              : habitItem
          )
        );
      }
    } catch {
      setHabits(previousHabits);
    }
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>, item: HabitListItem) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }

    if (event.key === "Escape") {
      event.currentTarget.value = item.habit.name;
      event.currentTarget.blur();
    }
  }

  async function deactivateHabit(item: HabitListItem) {
    const previousHabits = habits;
    setError(null);
    setHabits((current) => current.filter((habit) => habit.habit.id !== item.habit.id));

    try {
      const payload = await requestJson<{ habit?: Habit; error?: string }>(
        `/api/habits/${item.habit.id}/deactivate`,
        { method: "PATCH" },
        "Unable to deactivate habit."
      );

      if (!payload.habit) {
        throw new Error("Unable to deactivate habit.");
      }
    } catch (caught) {
      setHabits(previousHabits);
      setError(caught instanceof Error ? caught.message : "Unable to deactivate habit.");
    }
  }

  async function toggleCheckin(item: HabitListItem) {
    const previousHabits = habits;
    const sequence = nextCheckinSequence(item.habit.id);
    setError(null);

    if (item.isCompleted) {
      const optimisticCheckin = decrementOptimisticCheckin(item);
      setRestoredHabitId(item.habit.id);
      setPendingCheckinHabitIds((current) => addSetValue(current, item.habit.id));
      setHabits((current) => updateHabitCheckin(current, item, optimisticCheckin));

      try {
        const [payload] = await Promise.all([
          requestJson<{ checkin?: HabitCheckin | null; error?: string }>(
            `/api/habits/${item.habit.id}/checkins/${date}`,
            { method: "DELETE" },
            "Unable to cancel habit check-in."
          ),
          delay(320)
        ]);

        if (isLatestCheckinSequence(item.habit.id, sequence)) {
          setHabits((current) => updateHabitCheckin(current, item, payload.checkin ?? null));
        }
      } catch (caught) {
        if (isLatestCheckinSequence(item.habit.id, sequence)) {
          setHabits(previousHabits);
          setError(caught instanceof Error ? caught.message : "Unable to cancel habit check-in.");
        }
      } finally {
        if (isLatestCheckinSequence(item.habit.id, sequence)) {
          setPendingCheckinHabitIds((current) => removeSetValue(current, item.habit.id));
        }
      }
      return;
    }

    const optimisticCheckin = incrementOptimisticCheckin(item, date);
    setRestoredHabitId(null);
    setPendingCheckinHabitIds((current) => addSetValue(current, item.habit.id));
    setHabits((current) => updateHabitCheckin(current, item, optimisticCheckin));

    try {
      const [payload] = await Promise.all([
        requestJson<{ checkin?: HabitCheckin; error?: string }>(
          `/api/habits/${item.habit.id}/checkins`,
          { method: "POST" },
          "Unable to complete habit check-in."
        ),
        delay(320)
      ]);

      if (!payload.checkin) {
        throw new Error("Unable to complete habit check-in.");
      }

      if (isLatestCheckinSequence(item.habit.id, sequence)) {
        setHabits((current) => updateHabitCheckin(current, item, payload.checkin!));
      }
    } catch (caught) {
      if (isLatestCheckinSequence(item.habit.id, sequence)) {
        setHabits(previousHabits);
        setError(caught instanceof Error ? caught.message : "Unable to complete habit check-in.");
      }
    } finally {
      if (isLatestCheckinSequence(item.habit.id, sequence)) {
        setPendingCheckinHabitIds((current) => removeSetValue(current, item.habit.id));
      }
    }
  }

  function nextCheckinSequence(habitId: string): number {
    const next = (checkinMutationSequences.current.get(habitId) ?? 0) + 1;
    checkinMutationSequences.current.set(habitId, next);
    return next;
  }

  function isLatestCheckinSequence(habitId: string, sequence: number): boolean {
    return checkinMutationSequences.current.get(habitId) === sequence;
  }

  async function writeHabit(url: string, init: RequestInit): Promise<Habit | null> {
    setError(null);
    const payload = await requestJson<{ habit?: Habit; error?: string }>(url, init, "Unable to save habit.");

    if (!payload.habit) {
      throw new Error("Unable to save habit.");
    }

    return payload.habit;
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

  return (
    <section aria-label="每日健康习惯" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">每日健康习惯</h2>
            <p className="mt-1 text-xs text-slate-500">每日 02:00 刷新；完成后自动置底。</p>
          </div>
          <button
            aria-label={isEditingPanel ? "Done editing habits" : "Edit habits"}
            className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-semibold ${isEditingPanel ? "border-success bg-success-soft text-success-text" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            onClick={() => setIsEditingPanel((current) => !current)}
            type="button"
          >
            <Pencil aria-hidden="true" size={13} />
            {isEditingPanel ? "Done" : "Edit"}
          </button>
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{checkedCount}/{targetTotal} checked</span>
            <span>{progressPercent}%</span>
          </div>
          <div aria-label="Habit check-in progress" aria-valuemax={targetTotal} aria-valuemin={0} aria-valuenow={checkedCount} className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {error ? <p className="mt-3 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-text" role="alert">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-slate-600">Loading habits...</p> : null}

      {!loading && sortedHabits.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600">No active habits yet.</p>
      ) : null}

      {!loading && sortedHabits.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {sortedHabits.map((item) => {
            const rowClass = item.isCompleted ? "bg-slate-50 text-slate-400" : "bg-white text-slate-700";
            const itemCompletedCount = item.checkin?.completedCount ?? 0;
            const progressLabel = `${itemCompletedCount}/${item.habit.targetCount}`;
            const pendingCheckin = pendingCheckinHabitIds.has(item.habit.id);

            return (
              <li aria-busy={pendingCheckin} className={`grid gap-2 px-3 py-2 text-sm transition-colors duration-300 ${isEditingPanel ? "sm:grid-cols-[minmax(0,1fr)_5rem_2.5rem]" : "sm:grid-cols-[1.5rem_minmax(0,1fr)_4rem]"} sm:items-center ${pendingCheckin ? "bg-success-soft text-success-text ring-1 ring-inset ring-success" : rowClass}`} key={item.habit.id}>
                {isEditingPanel ? (
                  <>
                    <input
                      aria-label={`Habit name for ${item.habit.name}`}
                      className={`h-8 min-w-0 rounded-md border px-2 text-sm ${fieldControlClass}`}
                      defaultValue={item.habit.name}
                      onBlur={(event) => void updateHabit(item, { name: event.currentTarget.value })}
                      onKeyDown={(event) => handleNameKeyDown(event, item)}
                    />
                    <select
                      aria-label={`Daily target for ${item.habit.name}`}
                      className={`h-8 rounded-md border px-2 text-sm ${fieldControlClass}`}
                      onChange={(event) => void updateHabit(item, { targetCount: Number(event.target.value) })}
                      value={item.habit.targetCount}
                    >
                      {targetOptions.map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                    <button aria-label={`Deactivate ${item.habit.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-action-muted hover:bg-delete-soft hover:text-delete" onClick={() => void deactivateHabit(item)} type="button">
                      <Trash2 aria-hidden="true" data-testid="habit-trash-icon" size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button aria-label={item.isCompleted ? `Cancel check-in for ${item.habit.name}` : itemCompletedCount > 0 ? `Mark ${item.habit.name} progress` : `Mark ${item.habit.name} complete`} className={`inline-flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${pendingCheckin ? "animate-pulse border-success bg-success-soft text-success-text" : item.isCompleted ? "border-success bg-success text-white" : itemCompletedCount > 0 ? "border-success bg-success-soft text-success-text" : "border-slate-300 bg-white hover:border-success"}`} onClick={() => void toggleCheckin(item)} type="button">
                      {item.isCompleted ? <Check aria-hidden="true" data-testid="habit-checkmark" size={10} strokeWidth={3} /> : null}
                    </button>
                    <p className={`min-w-0 truncate font-medium ${item.isCompleted ? "line-through" : ""}`}>{item.habit.name}</p>
                    {editingTargetId === item.habit.id ? (
                      <select
                        aria-label={`Daily target for ${item.habit.name}`}
                        autoFocus
                        className={`h-8 rounded-md border px-2 text-xs ${fieldControlClass}`}
                        onBlur={() => setEditingTargetId(null)}
                        onChange={(event) => {
                          void updateHabit(item, { targetCount: Number(event.target.value) });
                          setEditingTargetId(null);
                        }}
                        value={item.habit.targetCount}
                      >
                        {targetOptions.map((count) => <option key={count} value={count}>{count}</option>)}
                      </select>
                    ) : (
                      <button aria-label={`Edit daily target for ${item.habit.name}`} className={`justify-self-start rounded-md px-2 py-1 text-xs font-medium hover:bg-slate-100 ${item.isCompleted ? "line-through text-slate-400" : "text-slate-500"}`} onClick={() => setEditingTargetId(item.habit.id)} type="button">
                        {progressLabel}
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {isEditingPanel ? (
        <form className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto]" onSubmit={createHabit}>
          <label className="sr-only" htmlFor="new-habit-name">New habit name</label>
          <input id="new-habit-name" aria-label="New habit name" className={`h-9 rounded-md border px-3 text-sm ${fieldControlClass}`} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="New habit" value={form.name} />
          <label className="sr-only" htmlFor="new-habit-target">New habit daily target</label>
          <select id="new-habit-target" aria-label="New habit daily target" className={`h-9 rounded-md border px-2 text-sm ${fieldControlClass}`} onChange={(event) => setForm((current) => ({ ...current, targetCount: event.target.value }))} value={form.targetCount}>
            {targetOptions.map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
          <button className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-ink px-3 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
            <Plus aria-hidden="true" size={15} />
            Add Habit
          </button>
        </form>
      ) : null}
    </section>
  );
}

function createOptimisticHabit(name: string, targetCount: number): Habit {
  const now = new Date().toISOString();

  return {
    id: `optimistic-habit-${now}`,
    name,
    description: "",
    icon: "",
    targetCount,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
}

function incrementOptimisticCheckin(item: HabitListItem, date: string): HabitCheckin {
  const now = new Date().toISOString();
  const previousCount = item.checkin?.completedCount ?? 0;
  const completedCount = Math.min(previousCount + 1, item.habit.targetCount);

  return {
    id: item.checkin?.id ?? `optimistic-checkin-${item.habit.id}-${date}`,
    habitId: item.habit.id,
    date,
    isCompleted: completedCount >= item.habit.targetCount,
    completedCount,
    note: item.checkin?.note ?? "",
    createdAt: item.checkin?.createdAt ?? now,
    updatedAt: now
  };
}

function decrementOptimisticCheckin(item: HabitListItem): HabitCheckin | null {
  const previousCount = item.checkin?.completedCount ?? item.habit.targetCount;
  const completedCount = Math.max(previousCount - 1, 0);

  if (completedCount === 0 || !item.checkin) {
    return null;
  }

  return {
    ...item.checkin,
    completedCount,
    isCompleted: completedCount >= item.habit.targetCount,
    updatedAt: new Date().toISOString()
  };
}

function updateHabitCheckin(items: HabitListItem[], item: HabitListItem, checkin: HabitCheckin | null): HabitListItem[] {
  return items.map((habitItem) =>
    habitItem.habit.id === item.habit.id
      ? { ...habitItem, checkin, isCompleted: (checkin?.completedCount ?? 0) >= habitItem.habit.targetCount }
      : habitItem
  );
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
