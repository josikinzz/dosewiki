import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { approvedGlossaryLocales, resolveSessionRole } from "@/lib/auth/roles";
import {
  getCredentialsByUsername,
  getMembershipByEmail,
  touchSignIn,
} from "./memberships";
import { UNMATCHABLE_PASSWORD_HASH, verifyPassword } from "./passwords";
import { authSecret } from "./runtimePolicy";
import { safeAuthRedirect } from "@/lib/auth/returnPath";

type AuthorizedMember = {
  id: string;
  email: string;
  name: string;
};

/**
 * Username + password against the Postgres memberships table. Returns the
 * member for the session, or null for every failure: unknown username,
 * banned member, no password set, wrong password. Auth.js maps null to a
 * generic CredentialsSignin error, so the reason never reaches the browser.
 *
 * Every non-blank attempt pays for one scrypt derivation, against the stored
 * hash when there is one and against `UNMATCHABLE_PASSWORD_HASH` otherwise,
 * so response time does not say whether the username exists.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<"username" | "password", unknown>> | undefined,
): Promise<AuthorizedMember | null> {
  const username = typeof credentials?.username === "string" ? credentials.username.trim() : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";

  if (!username || !password) {
    return null;
  }

  const member = await getCredentialsByUsername(username);
  const matched = await verifyPassword(password, member?.passwordHash ?? UNMATCHABLE_PASSWORD_HASH);
  if (!member || member.bannedAt || !member.passwordHash || !matched) {
    return null;
  }

  await touchSignIn(member.email);

  return { id: member.email, email: member.email, name: member.name ?? username };
}

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  providers: [
    CredentialsProvider({
      name: "Account",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      return safeAuthRedirect(url, baseUrl);
    },
    async jwt({ token, user }) {
      const email = user?.email ?? token.email;

      if (!email) {
        return token;
      }

      // Re-read the stored role on every JWT refresh so a role change or a
      // ban takes effect on the next request instead of at the next sign-in.
      // A failed read fails closed: the token keeps its identity but carries
      // no privilege until Postgres answers again, so a just-banned or demoted
      // member cannot ride out an outage on their old role.
      try {
        const membership = await getMembershipByEmail(email);
        token.role = membership?.bannedAt
          ? "viewer"
          : (resolveSessionRole({ role: membership?.role }) ?? "viewer");
        token.glossaryLocales = approvedGlossaryLocales({ role: token.role, glossaryLocales: membership?.glossaryLocales });
      } catch (error) {
        console.error("[Auth] Failed to read membership role; session degraded to viewer", error);
        token.role = "viewer";
        token.glossaryLocales = [];
      }

      return token;
    },
    async session({ session, token }) {
      if (!session.user) {
        session.user = {};
      }

      if (typeof token.sub === "string") {
        session.user.id = token.sub;
      }

      if (typeof token.email === "string") {
        session.user.email = token.email;
      }

      if (typeof token.name === "string") {
        session.user.name = token.name;
      }

      session.user.role = token.role;
      session.user.glossaryLocales = approvedGlossaryLocales(token);

      return session;
    },
  },
};
