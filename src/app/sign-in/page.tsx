import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Info, TriangleAlert } from "lucide-react";
import { authOptions, hasGitHubAuthConfigured, hasLegacyCredentialsAuthConfigured } from "@auth";
import { buildPageMetadata } from "@server/next/metadata";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SignInButton } from "../_components/SignInButton";
import { CredentialsSignInForm } from "../_components/CredentialsSignInForm";
import { Button } from "@/components/ui/button";
import { StatusFact, StatusPageShell } from "../_components/StatusPageShell";

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
  const inlineCodeClassName =
    "rounded-md border border-[color:var(--theme-border-subtle)] bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_78%,transparent)] px-1.5 py-0.5 text-[0.92em] text-[color:var(--theme-text-primary)]";

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <StatusPageShell
      badge="Editor access"
      badgeVariant="success"
      statusIcon="lucide:shield-check"
      statusTone="success"
      title="Sign in to dose.wiki"
      description={
        <>
          Editor access to <code className={inlineCodeClassName}>/dev</code> is limited to accounts with the{" "}
          <code className={inlineCodeClassName}>admin</code> or <code className={inlineCodeClassName}>editor</code>{" "}
          role in Convex memberships.
        </>
      }
      actions={
        <>
          <SignInButton callbackUrl={callbackUrl} disabled={!hasGitHubAuthConfigured} />
          <Button asChild variant="outline">
            <Link href="/substances">Back to public site</Link>
          </Button>
        </>
      }
      complement={
        <>
          <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">Access details</p>
          <StatusFact
            label="Allowed roles"
            value={
              <>
                <code className={inlineCodeClassName}>admin</code> or <code className={inlineCodeClassName}>editor</code>
              </>
            }
          />
          <StatusFact
            label="Redirect after sign in"
            value={<code className={inlineCodeClassName}>{callbackUrl}</code>}
          />
        </>
      }
    >
      {hasLegacyCredentialsAuthConfigured ? <CredentialsSignInForm callbackUrl={callbackUrl} /> : null}

      {hasGitHubAuthConfigured || hasLegacyCredentialsAuthConfigured ? null : (
        <Alert variant="warning">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>GitHub auth is not configured</AlertTitle>
          <AlertDescription>
            Add <code className={inlineCodeClassName}>AUTH_GITHUB_ID</code>,{" "}
            <code className={inlineCodeClassName}>AUTH_GITHUB_SECRET</code>, and{" "}
            <code className={inlineCodeClassName}>AUTH_SECRET</code> to enable real sign-in.
          </AlertDescription>
        </Alert>
      )}

      {hasLegacyCredentialsAuthConfigured ? (
        <Alert variant="warning">
          <Info className="h-4 w-4" />
          <AlertTitle>Using local credentials fallback</AlertTitle>
          <AlertDescription>
            GitHub OAuth is not configured locally, so this dev shell is using a temporary Auth.js credentials
            provider. Keep it limited to local migration work and use GitHub auth for production access.
          </AlertDescription>
        </Alert>
      ) : null}
    </StatusPageShell>
  );
}
