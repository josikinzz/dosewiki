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
          role. Sign in with your editor username and password to continue.
        </>
      }
      actions={
        <>
          {hasGitHubAuthConfigured ? <SignInButton callbackUrl={callbackUrl} /> : null}
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
          <AlertTitle>Sign-in is not configured</AlertTitle>
          <AlertDescription>
            Add <code className={inlineCodeClassName}>AUTH_SECRET</code> and at least one editor credentials env var
            to enable sign-in.
          </AlertDescription>
        </Alert>
      )}

      {hasLegacyCredentialsAuthConfigured ? (
        <Alert variant="warning">
          <Info className="h-4 w-4" />
          <AlertTitle>Use your editor credentials</AlertTitle>
          <AlertDescription>
            Sign in with the same editor username and password used for the legacy dev tools account.
          </AlertDescription>
        </Alert>
      ) : null}
    </StatusPageShell>
  );
}
