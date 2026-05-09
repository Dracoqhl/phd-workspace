import { randomUUID } from "node:crypto";

import type { CareRecord } from "@/types/care";

const fallbackMessages = [
  "今天不需要一次解决所有问题，只要往前走一点点就很好。",
  "给自己一点缓冲，稳定推进比用力过猛更适合长期科研。",
  "把注意力放回下一件小事上，今天先完成一个清晰的动作。"
];

export function getCareDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getFallbackCareContent(date: string, refreshIndex = 0): string {
  const seed = [...date].reduce((sum, char) => sum + char.charCodeAt(0), refreshIndex);
  return fallbackMessages[seed % fallbackMessages.length];
}

export function createFallbackCareRecord(date: string, existing?: CareRecord | null): CareRecord {
  const now = new Date().toISOString();
  const refreshIndex = existing ? 1 : 0;

  return {
    id: existing?.id ?? randomUUID(),
    date,
    content: getFallbackCareContent(date, refreshIndex),
    source: "fallback",
    isChecked: existing?.isChecked ?? false,
    moodNote: existing?.moodNote ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}
