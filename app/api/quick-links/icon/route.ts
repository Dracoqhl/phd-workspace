import { requireUser } from "@/lib/api/auth";
import { buildGoogleFaviconUrl, parseQuickLinkUrl } from "@/lib/domain/quick-links";

const ICON_CACHE_HEADER = "public, max-age=86400, stale-while-revalidate=604800";

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

async function fetchFirstAvailableIcon(domain: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const candidates = [buildGoogleFaviconUrl(domain), `https://${domain}/favicon.ico`, `https://www.${domain}/favicon.ico`];

  for (const candidate of candidates) {
    const icon = await fetchIcon(candidate);
    if (icon) return icon;
  }

  return null;
}

async function fetchIcon(url: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
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

    return { body: await response.arrayBuffer(), contentType };
  } catch {
    return null;
  }
}
