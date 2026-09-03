import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { resolveSessionRole } from "./src/lib/auth/roles";
import {
  getCredentialsByUsername,
  getMembershipByEmail,
  touchSignIn,
} from "./lib/auth/convexMemberships";
import { verifyPassword } from "./lib/auth/passwords";
import { authSecret } from "./lib/auth/runtimePolicy";

type AuthorizedMember = {
  id: string;
  email: string;
  name: string;
};

/**
 * Username + password against the Convex memberships table. Returns the
 * member for the session, or null for every failure: unknown username,
 * banned member, no password set, wrong password. Auth.js maps null to a
 * generic CredentialsSignin error, so the reason never reaches the browser.
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
  if (!member || member.bannedAt || !member.passwordHash) {
    return null;
  }

  if (!(await verifyPassword(password, member.passwordHash))) {
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
    async jwt({ token, user }) {
      const email = user?.email ?? token.email;

      if (!email) {
        return token;
      }

      // Re-read the stored role on every JWT refresh so a role change or a
      // ban takes effect on the next request instead of at the next sign-in.
      try {
        const membership = await getMembershipByEmail(email);
        token.role = membership?.bannedAt
          ? "viewer"
          : (resolveSessionRole({ role: membership?.role }) ?? "viewer");
      } catch (error) {
        console.error("[Auth] Failed to read membership role", error);
        token.role = resolveSessionRole({ role: token.role }) ?? "viewer";
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

      return session;
    },
  },
};
