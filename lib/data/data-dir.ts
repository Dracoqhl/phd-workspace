import { isAbsolute } from "node:path";

export const RUNTIME_DATA_FILES = [
  "tasks.json",
  "habits.json",
  "habit-checkins.json",
  "care-records.json",
  "care-quote-preferences.json",
  "ai-logs.json",
  "trash.json"
] as const;

export type RuntimeDataFile = (typeof RUNTIME_DATA_FILES)[number];

export function resolveDataDir(value = process.env.DATA_DIR): string {
  if (!value || value.trim() === "") {
    throw new Error("DATA_DIR is not configured. Set DATA_DIR to an absolute runtime data path.");
  }

  if (!isAbsolute(value)) {
    throw new Error("DATA_DIR must be an absolute path.");
  }

  return value;
}
