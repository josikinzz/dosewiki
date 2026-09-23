import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/auth/roles";

declare module "next-auth" {
  interface User {
    passwordUpdatedAt?: string;
  }
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
    passwordUpdatedAt?: string;
    role?: AppRole;
    glossaryLocales?: string[];
  }
}
