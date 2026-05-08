export interface Habit {
  id: string;
  name: string;
  description: string;
  icon: string;
  targetCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHabitInput {
  name: string;
  description: string;
  icon: string;
  targetCount: number;
}

export interface UpdateHabitInput {
  name?: string;
  description?: string;
  icon?: string;
  targetCount?: number;
}

export interface HabitCheckin {
  id: string;
  habitId: string;
  date: string;
  isCompleted: boolean;
  completedCount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitListItem {
  habit: Habit;
  checkin: HabitCheckin | null;
  isCompleted: boolean;
}
