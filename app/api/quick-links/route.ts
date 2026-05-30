import { requireUser, type AuthContext } from "@/lib/api/auth";
import {
  getQuickLinkRepositories,
  INVALID_QUICK_LINK_PAYLOAD,
  parseCreateQuickLinkInput,
  quickLinksConfigErrorResponse,
  readJsonObject
} from "@/lib/api/quick-links";

export async function GET(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.listGroups();
  return Response.json({ groups });
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;

  const body = await readJsonObject(request);
  const input = body ? parseCreateQuickLinkInput(body) : null;
  if (!input) {
    return Response.json({ error: INVALID_QUICK_LINK_PAYLOAD }, { status: 400 });
  }

  const repos = getRepositoriesOrResponse(auth);
  if (repos instanceof Response) return repos;

  const groups = await repos.quickLinks.createLink(input);
  return Response.json({ groups }, { status: 201 });
}

function getRepositoriesOrResponse(auth: AuthContext): ReturnType<typeof getQuickLinkRepositories> | Response {
  try {
    return getQuickLinkRepositories(auth);
  } catch {
    return quickLinksConfigErrorResponse();
  }
}
