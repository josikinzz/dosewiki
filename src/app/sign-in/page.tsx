import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import {
  buildNoIndexPageMetadata,
  getSignInCallbackUrl,
  getStatusRecoveryLink,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { authRuntimePolicy } from "@server/auth/runtimePolicy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/common/Icon";
import { SignInButton } from "../_components/SignInButton";
import { CredentialsSignInForm } from "../_components/CredentialsSignInForm";
import { Button } from "@/components/ui/button";
import { StatusFact, StatusPageShell } from "../_components/StatusPageShell";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Sign in",
  description: "Sign in for dose.wiki editor access.",
  pathname: STATUS_PAGE_PATHS.signIn,
});

type SignInPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getServerSession(authOptions);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl = getSignInCallbackUrl(resolvedSearchParams?.callbackUrl);
  const publicSiteLink = getStatusRecoveryLink("substances");
  const hasGitHubAuthConfigured = authRuntimePolicy.github.available;
  const hasLegacyCredentialsAuthConfigured = authRuntimePolicy.legacyCredentials.available;
  const hasAuthSecretConfigured = Boolean(authRuntimePolicy.authSecret);
  const inlineCodeClassName =
    "rounded-md border border-[color:var(--theme-border-subtle)] bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_78%,var(--theme-body-bg))] px-1.5 py-0.5 text-[0.92em] text-[color:var(--theme-text-primary)]";

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
            <Link href={publicSiteLink.href}>Back to public site</Link>
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
          <Icon icon="lucide:triangle-alert" size={16} />
          <AlertTitle>Sign-in is not configured</AlertTitle>
          <AlertDescription>
            {hasAuthSecretConfigured ? (
              <>
                Add at least one editor password env var such as{" "}
                <code className={inlineCodeClassName}>ADMIN_PASSWORD</code> or{" "}
                <code className={inlineCodeClassName}>JOSIE</code> to enable sign-in.
              </>
            ) : (
              <>
                Add <code className={inlineCodeClassName}>AUTH_SECRET</code> and at least one editor password env var
                such as <code className={inlineCodeClassName}>ADMIN_PASSWORD</code> or{" "}
                <code className={inlineCodeClassName}>JOSIE</code> to enable sign-in.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {hasLegacyCredentialsAuthConfigured ? (
        <Alert variant="warning">
          <Icon icon="lucide:info" size={16} />
          <AlertTitle>Use your editor credentials</AlertTitle>
          <AlertDescription>
            Sign in with the same editor username and password used for the legacy dev tools account.
          </AlertDescription>
        </Alert>
      ) : null}
    </StatusPageShell>
  );
}
