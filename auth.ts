import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { resolveSessionRole } from "./src/lib/auth/roles";
import { syncMembershipFromAuth } from "./lib/auth/convexMemberships";
import { verifyLegacyCredentials } from "./lib/auth/legacyCredentials";
import {
  authRuntimePolicy,
  authSecret,
  hasGitHubAuthConfigured,
  hasLegacyCredentialsAuthConfigured,
} from "./lib/auth/runtimePolicy";

const legacyCredentialEmailDomain = "@local.dose.wiki";

function isLegacyCredentialEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(legacyCredentialEmailDomain);
}

const providers = [];

if (hasGitHubAuthConfigured) {
  providers.push(
    GitHubProvider({
      clientId: authRuntimePolicy.github.clientId!,
      clientSecret: authRuntimePolicy.github.clientSecret!,
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

      const isDevelopmentCredentialUser =
        account?.provider === "credentials" || isLegacyCredentialEmail(email);
      const credentialRole = resolveSessionRole({
        isDevelopmentCredentialUser,
        nodeEnv: process.env.NODE_ENV,
      });

      if (isDevelopmentCredentialUser && credentialRole) {
        token.role = credentialRole;
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

      if (typeof token.picture === "string") {
        session.user.image = token.picture;
      }

      session.user.role = token.role;

      return session;
    },
  },
};
