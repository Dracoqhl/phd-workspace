import { cookies } from "next/headers";

import { WorkspacePageContent } from "@/app/workspace-page-content";
import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from "@/lib/auth/session";

export default function Page() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const authenticated = isAuthenticated(token);

  return <WorkspacePageContent authenticated={authenticated} />;
}

function isAuthenticated(token: string | undefined): boolean {
  try {
    return verifySessionToken(token, getSessionSecret());
  } catch {
    return false;
  }
}
