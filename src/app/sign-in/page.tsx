import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, hasGitHubAuthConfigured, hasLegacyCredentialsAuthConfigured } from "@auth";
import { buildPageMetadata } from "@server/next/metadata";
import { SignInButton } from "../_components/SignInButton";
import { CredentialsSignInForm } from "../_components/CredentialsSignInForm";

export const dynamic = "force-dynamic";
export const metadata = buildPageMetadata({
  title: "Sign in",
  description: "Sign in for dose.wiki editor access.",
  pathname: "/sign-in",
  noIndex: true,
});

type SignInPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getServerSession(authOptions);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl = resolvedSearchParams?.callbackUrl ?? "/dev";

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl items-center px-4 py-16">
      <section className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-fuchsia-950/20 backdrop-blur">
        <div className="space-y-4">
          <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
            Editor access
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white">
            Sign in to dose.wiki
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/70">
            Editor access to <code>/dev</code> is limited to accounts with <code>admin</code> or <code>editor</code>
            membership roles.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <SignInButton callbackUrl={callbackUrl} disabled={!hasGitHubAuthConfigured} />
          <Link
            href="/substances"
            className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:text-white"
          >
            Back to public site
          </Link>
        </div>

        {hasLegacyCredentialsAuthConfigured ? (
          <CredentialsSignInForm callbackUrl={callbackUrl} />
        ) : null}

        {hasGitHubAuthConfigured || hasLegacyCredentialsAuthConfigured ? null : (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/90">
            GitHub auth is not configured yet. Add <code>AUTH_GITHUB_ID</code>, <code>AUTH_GITHUB_SECRET</code>,
            and <code>AUTH_SECRET</code> to enable real sign-in.
          </div>
        )}

        {hasLegacyCredentialsAuthConfigured ? (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/90">
            GitHub OAuth is not configured locally, so this dev shell is using a temporary Auth.js credentials fallback.
            It is for local migration work only and should not replace the GitHub provider in production.
          </div>
        ) : null}
      </section>
    </main>
  );
}
