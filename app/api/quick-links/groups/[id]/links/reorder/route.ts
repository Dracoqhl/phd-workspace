import { requireUser, type AuthContext } from "@/lib/api/auth";
import { getQuickLinkRepositories, INVALID_QUICK_LINK_PAYLOAD, quickLinksConfigErrorResponse, readJsonObject } from "@/lib/api/quick-links";

interface QuickLinkGroupLinksReorderRouteContext {
  params: {
    id: string;
  };
}

export async function PATCH(request: Request, context: QuickLinkGroupLinksReorderRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const linkIds = parseLinkIds(body);
  if (!linkIds) {
    return Response.json({ error: INVALID_QUICK_LINK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.reorderLinks(context.params.id, linkIds);
  if (!groups) {
    return Response.json({ error: INVALID_QUICK_LINK_PAYLOAD }, { status: 400 });
  }

  return Response.json({ groups });
}

function parseLinkIds(body: Record<string, unknown> | null): string[] | null {
  if (!body || !Array.isArray(body.linkIds)) return null;
  if (!body.linkIds.every((id) => typeof id === "string" && id.trim())) return null;
  return body.linkIds;
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getQuickLinkRepositories> | Response {
  try {
    return getQuickLinkRepositories(auth);
  } catch {
    return quickLinksConfigErrorResponse();
  }
}
