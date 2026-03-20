import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@auth";
import { canAccessDev, isAppRole, type AppRole } from "@/lib/auth/roles";

type EditorSession = Awaited<ReturnType<typeof getServerSession>> & {
  user: {
    email: string;
    name?: string | null;
    role?: AppRole;
  };
};

type SessionGuardResult =
  | {
      ok: true;
      role: AppRole;
      session: EditorSession;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireEditorSession(): Promise<SessionGuardResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const role = isAppRole(session.user.role) ? session.user.role : null;
  if (!canAccessDev(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Editor access required." }, { status: 403 }),
    };
  }

  return {
    ok: true,
    role,
    session: session as EditorSession,
  };
}
