import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@auth";
import { resolveSessionRole, roleMeetsFloor, type AppRole, type RoleFloor } from "@/lib/auth/roles";

type EditorSession = Awaited<ReturnType<typeof getServerSession>> & {
  user: {
    email: string;
    name?: string | null;
    role?: AppRole;
    glossaryLocales?: string[];
  };
};

export type RoleSessionGranted = {
  ok: true;
  role: AppRole;
  session: EditorSession;
};

type SessionGuardResult =
  | RoleSessionGranted
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * Session gate for protected routes. `floor` is the lowest role admitted:
 * `admin` for destructive and publishing routes, `editor` for drafting and
 * review metadata, `contributor` for routes that then check ownership.
 */
export async function requireRoleSession(floor: RoleFloor): Promise<SessionGuardResult> {
  // Legacy protected endpoints outside /api/dev must obey the same publication boundary.
  if (process.env.NEXT_PUBLIC_EDITOR_BUILD === "false") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Editor operations are unavailable on this publication." },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      ),
    };
  }
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const role = resolveSessionRole({ role: session.user.role });
  if (!role || !roleMeetsFloor(role, floor)) {
    const label = floor.charAt(0).toUpperCase() + floor.slice(1);
    return {
      ok: false,
      response: NextResponse.json({ error: `${label} access required.` }, { status: 403 }),
    };
  }

  return {
    ok: true,
    role,
    session: session as EditorSession,
  };
}
