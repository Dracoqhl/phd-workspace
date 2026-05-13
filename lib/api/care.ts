import { getAiConfig } from "@/lib/ai/config";
import { generateAiCareContent } from "@/lib/ai/care";
import { createAiCareRecord, createFallbackCareRecord, getCareDate } from "@/lib/domain/care";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/api/auth";
import type { CareRecord, UpdateCareInput } from "@/types/care";

export const DATA_DIR_CONFIG_ERROR = "Data directory is not configured";
export const INVALID_CARE_PAYLOAD = "Invalid care payload";

export function dataConfigErrorResponse(): Response {
  return Response.json({ error: DATA_DIR_CONFIG_ERROR }, { status: 500 });
}

export function getCareRepositories(auth?: AuthContext) {
  if (isDatabaseConfigured()) {
    if (!auth?.user) {
      throw new Error("Authenticated user is required");
    }
    const db = getDatabase();
    ensureDatabaseSchema(db);
    return createSqliteRepositories(db, auth.user.id);
  }

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
  const config = getAiConfig();
  const content = config ? await generateAiCareContent(config) : null;

  return repos.careRecords.upsertByDate(date, (existing) =>
    content ? createAiCareRecord(date, content, existing) : createFallbackCareRecord(date, existing)
  );
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

export async function updateTodayCareRecord(
  repos: ReturnType<typeof getCareRepositories>,
  input: UpdateCareInput
): Promise<CareRecord> {
  const date = getCareDate();
  return repos.careRecords.upsertByDate(date, (existing) => {
    const base = createFallbackCareRecord(date, existing);
    const now = new Date().toISOString();

    return {
      ...base,
      ...input,
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

export function parseCareUpdateInput(body: Record<string, unknown>): UpdateCareInput | null {
  const input: UpdateCareInput = {};

  if ("energyLevel" in body) {
    if (body.energyLevel !== null && !isEnergyLevel(body.energyLevel)) {
      return null;
    }

    input.energyLevel = body.energyLevel;
  }

  if ("isFavorite" in body) {
    if (typeof body.isFavorite !== "boolean") {
      return null;
    }

    input.isFavorite = body.isFavorite;
  }

  if ("focusText" in body) {
    if (typeof body.focusText !== "string") {
      return null;
    }

    input.focusText = body.focusText;
  }

  return Object.keys(input).length > 0 ? input : null;
}

function isEnergyLevel(value: unknown): value is NonNullable<CareRecord["energyLevel"]> {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
