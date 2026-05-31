import { requireUser, type AuthContext } from "@/lib/api/auth";
import { getQuickLinkRepositories, INVALID_QUICK_LINK_PAYLOAD, quickLinksConfigErrorResponse, readJsonObject } from "@/lib/api/quick-links";

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const groupIds = parseGroupIds(body);
  if (!groupIds) {
    return Response.json({ error: INVALID_QUICK_LINK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.reorderGroups(groupIds);
  if (!groups) {
    return Response.json({ error: INVALID_QUICK_LINK_PAYLOAD }, { status: 400 });
  }

  return Response.json({ groups });
}

function parseGroupIds(body: Record<string, unknown> | null): string[] | null {
  if (!body || !Array.isArray(body.groupIds)) return null;
  if (!body.groupIds.every((id) => typeof id === "string" && id.trim())) return null;
  return body.groupIds;
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getQuickLinkRepositories> | Response {
  try {
    return getQuickLinkRepositories(auth);
  } catch {
    return quickLinksConfigErrorResponse();
  }
}
