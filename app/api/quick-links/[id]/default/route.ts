import { requireUser, type AuthContext } from "@/lib/api/auth";
import { getQuickLinkRepositories, quickLinksConfigErrorResponse } from "@/lib/api/quick-links";

interface QuickLinkDefaultRouteContext {
  params: {
    id: string;
  };
}

export async function POST(request: Request, context: QuickLinkDefaultRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.setDefaultLink(context.params.id);
  if (!groups) {
    return Response.json({ error: "Quick link not found" }, { status: 404 });
  }

  return Response.json({ groups });
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getQuickLinkRepositories> | Response {
  try {
    return getQuickLinkRepositories(auth);
  } catch {
    return quickLinksConfigErrorResponse();
  }
}
