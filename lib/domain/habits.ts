import type { HabitListItem } from "@/types/habit";

const HABIT_DAY_START_HOUR = 2;

export function getHabitBusinessDate(date = new Date()): string {
  const businessDate = new Date(date);
  businessDate.setHours(businessDate.getHours() - HABIT_DAY_START_HOUR);

  return formatLocalDate(businessDate);
}

export function sortHabitListItems(items: HabitListItem[], restoredHabitId: string | null = null): HabitListItem[] {
  return [...items].sort((left, right) => {
    if (!left.isCompleted && left.habit.id === restoredHabitId) {
      return -1;
    }

    if (!right.isCompleted && right.habit.id === restoredHabitId) {
      return 1;
    }

    if (left.isCompleted !== right.isCompleted) {
      return left.isCompleted ? 1 : -1;
    }

    return 0;
  });
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
