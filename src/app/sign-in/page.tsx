import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import {
  buildNoIndexPageMetadata,
  getSignInCallbackUrl,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { getStatusRecoveryLink } from "@server/next/statusRecoveryLinks";
import { authRuntimePolicy } from "@server/auth/runtimePolicy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/common/Icon";
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
  const [session, resolvedSearchParams] = await Promise.all([
    getServerSession(authOptions),
    searchParams,
  ]);
  const callbackUrl = getSignInCallbackUrl(resolvedSearchParams?.callbackUrl);
  const publicSiteLink = getStatusRecoveryLink("substances");
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
          Accounts are created by invitation. Sign in with the username and password you set when you
          accepted your invite.
        </>
      }
      actions={
        <Button asChild variant="ghost">
          <Link href={publicSiteLink.href}>Back to public site</Link>
        </Button>
      }
      complementHeading="Access details"
      complement={
        <>
          <StatusFact
            tone="plain"
            label="Roles"
            value={
              <>
                <code className={inlineCodeClassName}>admin</code>, <code className={inlineCodeClassName}>editor</code>,{" "}
                or <code className={inlineCodeClassName}>contributor</code>
              </>
            }
          />
          <StatusFact
            tone="plain"
            label="Redirect after sign in"
            value={<code className={`${inlineCodeClassName} break-all`}>{callbackUrl}</code>}
          />
        </>
      }
    >
      {authRuntimePolicy.sessionsAvailable ? (
        <CredentialsSignInForm callbackUrl={callbackUrl} />
      ) : (
        <Alert variant="warning">
          <Icon icon="lucide:triangle-alert" size={16} />
          <AlertTitle>Sign-in is not configured</AlertTitle>
          <AlertDescription>
            Set <code className={inlineCodeClassName}>AUTH_SECRET</code> on this deployment before anyone can sign
            in.
          </AlertDescription>
        </Alert>
      )}
    </StatusPageShell>
  );
}
