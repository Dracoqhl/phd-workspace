import { requireUser } from "@/lib/api/auth";
import { buildGoogleFaviconUrl, parseQuickLinkUrl } from "@/lib/domain/quick-links";

const ICON_CACHE_HEADER = "public, max-age=86400, stale-while-revalidate=604800";
const INFTAB_LOGO_API = "https://api.inftab.com/v2/icon/get_logo_list";
const MIN_LOGO_PIXELS = 128;

interface InftabLogoListResponse {
  code?: number;
  data?: Array<{
    src?: string;
  }>;
}

export async function GET(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? "";
  const parsed = parseQuickLinkUrl(`https://${domain}`);
  if (!parsed || parsed.domain !== domain.trim().toLowerCase().replace(/^www\./, "")) {
    return Response.json({ error: "Invalid quick link icon domain" }, { status: 400 });
  }

  const icon = await fetchFirstAvailableIcon(parsed.domain);
  if (!icon) {
    return Response.json({ error: "Quick link icon not found" }, { status: 404 });
  }

  return new Response(icon.body, {
    headers: {
      "Cache-Control": ICON_CACHE_HEADER,
      "Content-Type": icon.contentType
    }
  });
}

interface IconCandidate {
  body: ArrayBuffer;
  contentType: string;
  pixels: number | null;
}

async function fetchFirstAvailableIcon(domain: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const inftabIcon = await fetchInftabIcon(domain);
  if (inftabIcon) return inftabIcon;

  const candidates = [buildGoogleFaviconUrl(domain), `https://${domain}/favicon.ico`, `https://www.${domain}/favicon.ico`];
  let lowResolutionFallback: IconCandidate | null = null;

  for (const candidate of candidates) {
    const icon = await fetchIcon(candidate);
    if (!icon) continue;
    if (isHighResolutionIcon(icon)) return icon;
    lowResolutionFallback ??= icon;
  }

  return lowResolutionFallback;
}

async function fetchInftabIcon(domain: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  try {
    const url = new URL(INFTAB_LOGO_API);
    url.searchParams.set("host", domain);
    url.searchParams.set("limit", "5");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PhDWorkspace/1.1; +https://github.com/Dracoqhl/phd-workspace)"
      }
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as InftabLogoListResponse;
    const sources = payload.data?.map((item) => item.src).filter((src): src is string => Boolean(src)).slice(0, 5) ?? [];
    const candidates: IconCandidate[] = [];
    for (const source of sources) {
      const icon = await fetchIcon(source);
      if (icon && isHighResolutionIcon(icon)) {
        candidates.push(icon);
      }
    }

    return candidates.sort((a, b) => (b.pixels ?? 0) - (a.pixels ?? 0))[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchIcon(url: string): Promise<IconCandidate | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PhDWorkspace/1.1; +https://github.com/Dracoqhl/phd-workspace)"
      }
    });
    const contentType = response.headers.get("content-type") ?? "image/x-icon";
    if (!response.ok || !contentType.startsWith("image/")) {
      return null;
    }

    const body = await response.arrayBuffer();
    return { body, contentType, pixels: getIconPixels(body, contentType) };
  } catch {
    return null;
  }
}

function isHighResolutionIcon(icon: IconCandidate): boolean {
  return icon.contentType.includes("svg") || (icon.pixels !== null && icon.pixels >= MIN_LOGO_PIXELS * MIN_LOGO_PIXELS);
}

function getIconPixels(body: ArrayBuffer, contentType: string): number | null {
  if (contentType.includes("svg")) {
    return Number.MAX_SAFE_INTEGER;
  }

  const bytes = new Uint8Array(body);
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !pngSignature.every((value, index) => bytes[index] === value)) {
    return null;
  }

  const view = new DataView(body);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width * height;
}
