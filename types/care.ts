export type CareSource = "ai_generated" | "fallback";

export interface CareRecord {
  id: string;
  date: string;
  content: string;
  source: CareSource;
  isChecked: boolean;
  moodNote: string;
  createdAt: string;
  updatedAt: string;
}
