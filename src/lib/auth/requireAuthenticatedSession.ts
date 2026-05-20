import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@auth";
import { canUseSelfProfileRoute, resolveSessionRole, type AppRole } from "@/lib/auth/roles";

type AuthenticatedSession = Awaited<ReturnType<typeof getServerSession>> & {
  user: {
    email: string;
    name?: string | null;
    role?: AppRole;
  };
};

type AuthenticatedSessionResult =
  | {
      ok: true;
      role: AppRole | null;
      session: AuthenticatedSession;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireAuthenticatedSession(): Promise<AuthenticatedSessionResult> {
  const session = await getServerSession(authOptions);

  if (!canUseSelfProfileRoute({ email: session?.user?.email })) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  return {
    ok: true,
    role: resolveSessionRole({ role: session.user.role }),
    session: session as AuthenticatedSession,
  };
}
