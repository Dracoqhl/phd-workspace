export interface Habit {
  id: string;
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HabitCheckin {
  id: string;
  habitId: string;
  date: string;
  isCompleted: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}
