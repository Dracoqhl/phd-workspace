import { randomUUID } from "node:crypto";

import type { CareRecord } from "@/types/care";

const fallbackMessages = [
  "今天不需要一次解决所有问题，只要往前走一点点就很好。",
  "给自己一点缓冲，稳定推进比用力过猛更适合长期科研。",
  "把注意力放回下一件小事上，今天先完成一个清晰的动作。"
];

export const DEFAULT_CARE_QUOTE_PREFERENCE = "温和、具体、低压力、适合博士科研日常";

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

export function getFallbackCareQuoteBatch(): string[] {
  return [
    ...fallbackMessages,
    "科研是长期工作，今天只需要把一个环节变清楚一点。",
    "先照顾好自己的节奏，再处理复杂的问题。",
    "把任务拆小一点，稳定推进本身就是进展。",
    "允许今天只完成一件重要的小事。",
    "不必用焦虑证明努力，清晰行动更重要。",
    "把注意力放在下一步，而不是全部结果。",
    "慢一点也没关系，持续比冲刺更适合长期研究。",
    "今天给自己留一点余地，也给思考留一点空间。",
    "一个可完成的步骤，胜过一整天的自责。"
  ];
}

export function createFallbackCareRecord(date: string, existing?: CareRecord | null): CareRecord {
  return createCareRecord(date, getFallbackCareContent(date, existing ? 1 : 0), "fallback", existing);
}

export function createAiCareRecord(date: string, content: string, existing?: CareRecord | null): CareRecord {
  return createCareRecord(date, content, "ai_generated", existing);
}

function createCareRecord(
  date: string,
  content: string,
  source: CareRecord["source"],
  existing?: CareRecord | null
): CareRecord {
  const now = new Date().toISOString();

  return {
    id: existing?.id ?? randomUUID(),
    date,
    content,
    source,
    energyLevel: existing?.energyLevel ?? null,
    isFavorite: existing?.isFavorite ?? false,
    focusText: existing?.focusText ?? "",
    isChecked: existing?.isChecked ?? false,
    moodNote: existing?.moodNote ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}
