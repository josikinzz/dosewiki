import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, hasGitHubAuthConfigured, hasLegacyCredentialsAuthConfigured } from "@auth";
import { buildPageMetadata } from "@server/next/metadata";
import { SignInButton } from "../_components/SignInButton";
import { CredentialsSignInForm } from "../_components/CredentialsSignInForm";
import { Button } from "@/components/ui/button";

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
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl items-center px-4 py-16 focus:outline-none">
      <section className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-fuchsia-950/20 backdrop-blur">
        <div className="space-y-4">
          <div className="inline-flex rounded-full border border-[color:var(--theme-success-border)] bg-[color:var(--theme-success-bg)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-success-text)]">
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
          <Button asChild variant="outline">
            <Link href="/substances">Back to public site</Link>
          </Button>
        </div>

        {hasLegacyCredentialsAuthConfigured ? (
          <CredentialsSignInForm callbackUrl={callbackUrl} />
        ) : null}

        {hasGitHubAuthConfigured || hasLegacyCredentialsAuthConfigured ? null : (
          <div className="mt-6 rounded-2xl border border-[color:var(--theme-warning-border)] bg-[color:var(--theme-warning-bg)] p-4 text-sm leading-6 text-[color:var(--theme-warning-text)]">
            GitHub auth is not configured yet. Add <code>AUTH_GITHUB_ID</code>, <code>AUTH_GITHUB_SECRET</code>,
            and <code>AUTH_SECRET</code> to enable real sign-in.
          </div>
        )}

        {hasLegacyCredentialsAuthConfigured ? (
          <div className="mt-6 rounded-2xl border border-[color:var(--theme-warning-border)] bg-[color:var(--theme-warning-bg)] p-4 text-sm leading-6 text-[color:var(--theme-warning-text)]">
            GitHub OAuth is not configured locally, so this dev shell is using a temporary Auth.js credentials fallback.
            It is for local migration work only and should not replace the GitHub provider in production.
          </div>
        ) : null}
      </section>
    </main>
  );
}
