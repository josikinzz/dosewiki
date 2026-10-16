import { roleMeetsFloor, type AppRole, type RoleFloor } from "@/lib/auth/roles";

type SessionUser = { email: string; name?: string | null; glossaryLocales?: string[] };

const DEFAULT_USER: SessionUser = { email: "editor@example.com", name: "Editor" };

export function roleSessionFor(role: AppRole | null, user: SessionUser = DEFAULT_USER) {
  return async (floor: RoleFloor) => {
    if (!role) {
      return {
        ok: false as const,
        response: Response.json({ error: "Authentication required." }, { status: 401 }),
      };
    }
    if (!roleMeetsFloor(role, floor)) {
      const label = floor.charAt(0).toUpperCase() + floor.slice(1);
      return {
        ok: false as const,
        response: Response.json({ error: `${label} access required.` }, { status: 403 }),
      };
    }
    return { ok: true as const, role, session: { user: { ...user, role } } };
  };
}
