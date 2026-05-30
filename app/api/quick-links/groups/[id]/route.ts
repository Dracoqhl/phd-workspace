import { requireUser, type AuthContext } from "@/lib/api/auth";
import {
  getQuickLinkRepositories,
  INVALID_QUICK_LINK_PAYLOAD,
  parseUpdateQuickLinkGroupInput,
  quickLinksConfigErrorResponse,
  readJsonObject
} from "@/lib/api/quick-links";

interface QuickLinkGroupRouteContext {
  params: {
    id: string;
  };
}

export async function PATCH(request: Request, context: QuickLinkGroupRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseUpdateQuickLinkGroupInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_QUICK_LINK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.updateGroup(context.params.id, input);
  if (!groups) {
    return Response.json({ error: "Quick link group not found" }, { status: 404 });
  }

  return Response.json({ groups });
}

export async function DELETE(request: Request, context: QuickLinkGroupRouteContext): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.deleteGroup(context.params.id);
  if (!groups) {
    return Response.json({ error: "Quick link group not found" }, { status: 404 });
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
