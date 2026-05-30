import { requireUser, type AuthContext } from "@/lib/api/auth";
import {
  getQuickLinkRepositories,
  INVALID_QUICK_LINK_PAYLOAD,
  parseUpdateQuickLinkInput,
  quickLinksConfigErrorResponse,
  readJsonObject
} from "@/lib/api/quick-links";

interface QuickLinkRouteContext {
  params: {
    id: string;
  };
}

export async function PATCH(request: Request, context: QuickLinkRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseUpdateQuickLinkInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_QUICK_LINK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.updateLink(context.params.id, input);
  if (!groups) {
    return Response.json({ error: "Quick link not found" }, { status: 404 });
  }

  return Response.json({ groups });
}

export async function DELETE(request: Request, context: QuickLinkRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.deleteLink(context.params.id);
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
