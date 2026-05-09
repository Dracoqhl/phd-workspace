import { createFallbackCareRecord, getCareDate } from "@/lib/domain/care";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";
import type { CareRecord } from "@/types/care";

export const DATA_DIR_CONFIG_ERROR = "Data directory is not configured";
export const INVALID_CARE_PAYLOAD = "Invalid care payload";

export function dataConfigErrorResponse(): Response {
  return Response.json({ error: DATA_DIR_CONFIG_ERROR }, { status: 500 });
}

export function getCareRepositories() {
  return createRepositories(resolveDataDir());
}

export async function ensureTodayCareRecord(repos: ReturnType<typeof getCareRepositories>): Promise<CareRecord> {
  const date = getCareDate();
  const existing = await repos.careRecords.getByDate(date);

  if (existing) {
    return existing;
  }

  return repos.careRecords.upsertByDate(date, () => createFallbackCareRecord(date));
}

export async function refreshTodayCareRecord(repos: ReturnType<typeof getCareRepositories>): Promise<CareRecord> {
  const date = getCareDate();
  return repos.careRecords.upsertByDate(date, (existing) => createFallbackCareRecord(date, existing));
}

export async function checkInTodayCareRecord(
  repos: ReturnType<typeof getCareRepositories>,
  input: { isChecked: boolean; moodNote: string }
): Promise<CareRecord> {
  const date = getCareDate();
  return repos.careRecords.upsertByDate(date, (existing) => {
    const base = createFallbackCareRecord(date, existing);
    const now = new Date().toISOString();

    return {
      ...base,
      isChecked: input.isChecked,
      moodNote: input.moodNote,
      updatedAt: now
    };
  });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export function parseCareCheckinInput(body: Record<string, unknown>): { isChecked: boolean; moodNote: string } | null {
  if (typeof body.isChecked !== "boolean") {
    return null;
  }

  if (body.moodNote !== undefined && typeof body.moodNote !== "string") {
    return null;
  }

  return {
    isChecked: body.isChecked,
    moodNote: typeof body.moodNote === "string" ? body.moodNote : ""
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
