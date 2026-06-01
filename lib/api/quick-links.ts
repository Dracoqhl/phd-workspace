import { isIP } from "node:net";

import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { createSqliteRepositories } from "@/lib/db/repositories";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import { limitQuickLinkName, parseQuickLinkUrl } from "@/lib/domain/quick-links";
import type { AuthContext } from "@/lib/api/auth";
import type { CreateQuickLinkInput, UpdateQuickLinkGroupInput, UpdateQuickLinkInput } from "@/types/quick-link";

export const INVALID_QUICK_LINK_PAYLOAD = "Invalid quick link payload";
export const QUICK_LINKS_CONFIG_ERROR = "Quick links require database mode";

export function quickLinksConfigErrorResponse(): Response {
  return Response.json({ error: QUICK_LINKS_CONFIG_ERROR }, { status: 404 });
}

export function getQuickLinkRepositories(auth: AuthContext) {
  if (!isDatabaseConfigured() || !auth.user) {
    throw new Error("Quick links require database mode");
  }

  const db = getDatabase();
  ensureDatabaseSchema(db);
  return createSqliteRepositories(db, auth.user.id);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseCreateQuickLinkInput(body: Record<string, unknown>): CreateQuickLinkInput | null {
  if (typeof body.url !== "string" || !parseQuickLinkUrl(body.url)) return null;
  if ("title" in body && typeof body.title !== "string") return null;

  const title = typeof body.title === "string" ? limitQuickLinkName(body.title) : undefined;
  return { url: body.url, ...(title ? { title } : {}) };
}

export async function resolveCreateQuickLinkTitle(input: CreateQuickLinkInput): Promise<CreateQuickLinkInput> {
  if (input.title) return input;

  const title = await fetchPageTitle(input.url);
  return title ? { ...input, title } : input;
}

export function parseUpdateQuickLinkGroupInput(body: Record<string, unknown>): UpdateQuickLinkGroupInput | null {
  if (typeof body.displayName !== "string") return null;
  const displayName = limitQuickLinkName(body.displayName);
  if (!displayName) return null;
  return { displayName };
}

export function parseUpdateQuickLinkInput(body: Record<string, unknown>): UpdateQuickLinkInput | null {
  const input: UpdateQuickLinkInput = {};

  if ("title" in body) {
    if (typeof body.title !== "string") return null;
    const title = limitQuickLinkName(body.title);
    if (!title) return null;
    input.title = title;
  }

  if ("url" in body) {
    if (typeof body.url !== "string" || !parseQuickLinkUrl(body.url)) return null;
    input.url = body.url;
  }

  return Object.keys(input).length > 0 ? input : null;
}

async function fetchPageTitle(value: string): Promise<string | null> {
  const parsed = parseQuickLinkUrl(value);
  if (!parsed || isUnsafeMetadataHost(parsed.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(parsed.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; PhDWorkspace/1.1; +https://github.com/Dracoqhl/phd-workspace)"
      }
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;

    const html = await response.text();
    return limitQuickLinkName(extractPageTitle(html)) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractPageTitle(html: string): string {
  return (
    getMetaContent(html, ["og:title"]) ??
    getMetaContent(html, ["twitter:title"]) ??
    decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim()
  );
}

function getMetaContent(html: string, keys: string[]): string | null {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const key = (getHtmlAttribute(tag, "property") ?? getHtmlAttribute(tag, "name"))?.toLowerCase();
    if (!key || !keySet.has(key)) continue;

    const content = getHtmlAttribute(tag, "content");
    if (content?.trim()) return decodeHtmlEntities(content).trim();
  }

  return null;
}

function getHtmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isUnsafeMetadataHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 0) return false;
  if (ipVersion === 6) return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");

  const parts = normalized.split(".").map((part) => Number(part));
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}
