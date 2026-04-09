import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import type { AppRole } from "./src/lib/auth/roles";
import { syncMembershipFromAuth } from "./lib/auth/convexMemberships";
import { hasLegacyCredentialsConfigured, verifyLegacyCredentials } from "./lib/auth/legacyCredentials";

const githubClientId = process.env.AUTH_GITHUB_ID ?? process.env.GITHUB_ID;
const githubClientSecret = process.env.AUTH_GITHUB_SECRET ?? process.env.GITHUB_SECRET;

const authSecret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "dosewiki-next-auth-development-secret" : undefined);

const legacyCredentialEmailDomain = "@local.dose.wiki";

function isLegacyCredentialEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(legacyCredentialEmailDomain);
}

export const hasGitHubAuthConfigured = Boolean(githubClientId && githubClientSecret);
export const hasLegacyCredentialsAuthConfigured =
  !hasGitHubAuthConfigured && hasLegacyCredentialsConfigured();

const providers = [];

if (hasGitHubAuthConfigured) {
  providers.push(
    GitHubProvider({
      clientId: githubClientId!,
      clientSecret: githubClientSecret!,
    }),
  );
}

if (hasLegacyCredentialsAuthConfigured) {
  providers.push(
    CredentialsProvider({
      name: "Legacy credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = typeof credentials?.username === "string" ? credentials.username : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        const matchedKey = verifyLegacyCredentials(username, password);

        if (!matchedKey) {
          return null;
        }

        return {
          id: matchedKey,
          name: matchedKey,
          email: `${matchedKey.toLowerCase()}@local.dose.wiki`,
          image: null,
        };
      },
    }),
  );
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
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials") {
        return true;
      }

      return typeof user.email === "string" && user.email.trim().length > 0;
    },
    async jwt({ token, user, account }) {
      const email = user?.email ?? token.email;

      if (!email) {
        return token;
      }

      if (account?.provider === "credentials" || isLegacyCredentialEmail(email)) {
        token.role = "admin";
        return token;
      }

      try {
        const role = await syncMembershipFromAuth({
          email,
          name: user?.name ?? token.name,
          image:
            user?.image ?? (typeof token.picture === "string" ? token.picture : null),
          provider: account?.provider,
          providerAccountId: account?.providerAccountId,
        });

        token.role = role;
      } catch (error) {
        console.error("[Auth] Failed to sync membership from Auth.js", error);
        token.role = (token.role as AppRole | undefined) ?? "viewer";
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

      if (typeof token.picture === "string") {
        session.user.image = token.picture;
      }

      session.user.role = token.role;

      return session;
    },
  },
};
