import { cookies } from "next/headers";

import { WorkspacePageContent } from "@/app/workspace-page-content";
import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from "@/lib/auth/session";
import { SessionRepository, toPublicUser } from "@/lib/db/auth-repositories";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import type { PublicUser } from "@/types/user";

interface PageProps {
  searchParams?: {
    mode?: string;
  };
}

export default function Page({ searchParams = {} }: PageProps) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const authState = getPageAuthState(token);
  const initialAuthMode = searchParams?.mode === "register" ? "register" : "login";

  return (
    <WorkspacePageContent
      authenticated={authState.authenticated}
      initialAuthMode={initialAuthMode}
      multiUserEnabled={authState.multiUserEnabled}
      user={authState.user}
    />
  );
}

function getPageAuthState(token: string | undefined): {
  authenticated: boolean;
  multiUserEnabled: boolean;
  user: PublicUser | null;
} {
  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      ensureDatabaseSchema(db);
      const user = new SessionRepository(db).findUserByToken(token);
      return {
        authenticated: Boolean(user),
        multiUserEnabled: true,
        user: user ? toPublicUser(user) : null
      };
    } catch {
      return { authenticated: false, multiUserEnabled: true, user: null };
    }
  }

  try {
    return {
      authenticated: verifySessionToken(token, getSessionSecret()),
      multiUserEnabled: false,
      user: null
    };
  } catch {
    return { authenticated: false, multiUserEnabled: false, user: null };
  }
}
