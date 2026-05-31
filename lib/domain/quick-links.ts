export const QUICK_LINK_NAME_MAX_WEIGHT = 10;

const COMMON_SECOND_LEVEL_SUFFIXES = new Set(["co", "com", "net", "org", "edu", "gov", "ac"]);

export interface ParsedQuickLinkUrl {
  url: string;
  hostname: string;
  domain: string;
  defaultName: string;
  iconUrl: string;
}

export function parseQuickLinkUrl(value: string): ParsedQuickLinkUrl | null {
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(normalizedValue) ? normalizedValue : `https://${normalizedValue}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  const hostname = parsed.hostname.replace(/^www\./, "");
  if (!hostname || !hostname.includes(".")) {
    return null;
  }

  const domain = getRegistrableDomain(hostname);
  const defaultName = limitQuickLinkName(domain.split(".")[0] ?? domain);
  return {
    url: parsed.toString(),
    hostname,
    domain,
    defaultName,
    iconUrl: buildGoogleFaviconUrl(domain)
  };
}

export function limitQuickLinkName(value: string): string {
  let weight = 0;
  let result = "";

  for (const char of value.trim()) {
    const charWeight = /[\u4e00-\u9fff]/.test(char) ? 2 : 1;
    if (weight + charWeight > QUICK_LINK_NAME_MAX_WEIGHT) break;
    weight += charWeight;
    result += char;
  }

  return result;
}

export function buildGoogleFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function getRegistrableDomain(hostname: string): string {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");

  const [secondLevel, topLevel] = parts.slice(-2);
  if (topLevel.length === 2 && COMMON_SECOND_LEVEL_SUFFIXES.has(secondLevel) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}
