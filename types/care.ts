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

export interface CareQuotePreference {
  preferenceText: string;
  quotes: string[];
  quoteIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface CareTodayResponse {
  care: CareRecord;
  quotePreference: string;
  quoteBatch: string[];
  quoteIndex: number;
}

export interface UpdateCareInput {
  content?: string;
  energyLevel?: CareRecord["energyLevel"];
  isFavorite?: boolean;
  focusText?: string;
}
