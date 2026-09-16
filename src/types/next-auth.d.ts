import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id?: string;
      role?: AppRole;
      glossaryLocales?: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
    glossaryLocales?: string[];
  }
}
