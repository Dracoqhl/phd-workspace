export type CareSource = "ai_generated" | "fallback";

export interface CareRecord {
  id: string;
  date: string;
  content: string;
  source: CareSource;
  energyLevel: 1 | 2 | 3 | 4 | 5 | null;
  isFavorite: boolean;
  focusText: string;
  isChecked: boolean;
  moodNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCareInput {
  energyLevel?: CareRecord["energyLevel"];
  isFavorite?: boolean;
  focusText?: string;
}
