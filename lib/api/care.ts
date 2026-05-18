import { getAiConfig } from "@/lib/ai/config";
import { generateAiCareQuoteBatch } from "@/lib/ai/care";
import {
  createAiCareRecord,
  createFallbackCareRecord,
  DEFAULT_CARE_QUOTE_BATCH,
  DEFAULT_CARE_QUOTE_PREFERENCE,
  getCareDate,
  getFallbackCareQuoteBatch
} from "@/lib/domain/care";
import { resolveDataDir } from "@/lib/data/data-dir";
import { createRepositories } from "@/lib/data/repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/api/auth";
import type { CareQuotePreference, CareRecord, CareTodayResponse, UpdateCareInput } from "@/types/care";

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

export async function ensureTodayCareState(repos: ReturnType<typeof getCareRepositories>): Promise<CareTodayResponse> {
  const care = await ensureTodayCareRecord(repos);
  const cache = await ensureQuotePreference(repos);
  return toCareTodayResponse(care, cache);
}

export async function refreshTodayCareRecord(
  repos: ReturnType<typeof getCareRepositories>,
  input: { preferenceText?: string } = {}
): Promise<CareTodayResponse> {
  const date = getCareDate();
  const config = getAiConfig();
  const existingCache = await repos.careQuotePreferences.get();
  const preferenceText = normalizePreferenceText(input.preferenceText ?? existingCache?.preferenceText);
  const isDefaultPreference = preferenceText === DEFAULT_CARE_QUOTE_PREFERENCE;
  const canReuseCache =
    existingCache &&
    existingCache.preferenceText === preferenceText &&
    existingCache.quotes.length > 0 &&
    input.preferenceText !== undefined;
  const generatedQuotes = canReuseCache || isDefaultPreference ? null : config ? await generateAiCareQuoteBatch(config, preferenceText) : null;
  const quotes = canReuseCache
    ? existingCache.quotes
    : isDefaultPreference
      ? DEFAULT_CARE_QUOTE_BATCH
    : generatedQuotes?.length
      ? generatedQuotes
      : existingCache?.quotes.length
        ? existingCache.quotes
        : getFallbackCareQuoteBatch();
  const cache = await repos.careQuotePreferences.save({ preferenceText, quotes, quoteIndex: 0 });
  const content = quotes[0] ?? getFallbackCareQuoteBatch()[0];
  const source = generatedQuotes?.length ? "ai_generated" : canReuseCache ? null : "fallback";

  const care = await repos.careRecords.upsertByDate(date, (existing) =>
    source === "ai_generated"
      ? createAiCareRecord(date, content, existing)
      : {
          ...(source === "fallback" ? createFallbackCareRecord(date, existing) : createFallbackCareRecord(date, existing)),
          content,
          source: source ?? existing?.source ?? "fallback"
        }
  );
  if (care.content !== content || (source !== null && care.source !== source)) {
    const syncedCare = await repos.careRecords.upsertByDate(date, (existing) => ({
      ...(source === "ai_generated" ? createAiCareRecord(date, content, existing) : createFallbackCareRecord(date, existing)),
      content,
      source: source ?? existing?.source ?? "fallback"
    }));
    return toCareTodayResponse(syncedCare, cache);
  }

  return toCareTodayResponse(care, cache);
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
): Promise<CareTodayResponse> {
  const date = getCareDate();
  const care = await repos.careRecords.upsertByDate(date, (existing) => {
    const base = createFallbackCareRecord(date, existing);
    const now = new Date().toISOString();

    return {
      ...base,
      ...input,
      source: input.content ? existing?.source ?? base.source : base.source,
      updatedAt: now
    };
  });
  const cache = await syncQuoteIndex(repos, care.content);
  return toCareTodayResponse(care, cache);
}

export async function ensureQuotePreference(repos: ReturnType<typeof getCareRepositories>): Promise<CareQuotePreference> {
  const existing = await repos.careQuotePreferences.get();
  if (existing?.quotes.length) {
    return existing;
  }

  return repos.careQuotePreferences.save({
    preferenceText: normalizePreferenceText(existing?.preferenceText),
    quotes: getFallbackCareQuoteBatch(),
    quoteIndex: 0
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

  if ("content" in body) {
    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      return null;
    }

    input.content = body.content;
  }

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

export function parseCareGenerateInput(body: Record<string, unknown> | null): { preferenceText?: string } {
  if (!body || typeof body.preferenceText !== "string") {
    return {};
  }

  return { preferenceText: body.preferenceText };
}

function toCareTodayResponse(care: CareRecord, cache: CareQuotePreference): CareTodayResponse {
  return {
    care,
    quotePreference: cache.preferenceText,
    quoteBatch: cache.quotes,
    quoteIndex: normalizeQuoteIndex(cache.quoteIndex, cache.quotes)
  };
}

async function syncQuoteIndex(repos: ReturnType<typeof getCareRepositories>, content: string): Promise<CareQuotePreference> {
  const cache = await ensureQuotePreference(repos);
  const quoteIndex = cache.quotes.indexOf(content);
  if (quoteIndex < 0 || quoteIndex === cache.quoteIndex) {
    return cache;
  }

  return repos.careQuotePreferences.save({ ...cache, quoteIndex });
}

function normalizePreferenceText(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 240) : DEFAULT_CARE_QUOTE_PREFERENCE;
}

function normalizeQuoteIndex(index: number, quotes: string[]): number {
  if (quotes.length === 0) return 0;
  return Number.isInteger(index) && index >= 0 && index < quotes.length ? index : 0;
}

function isEnergyLevel(value: unknown): value is NonNullable<CareRecord["energyLevel"]> {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
