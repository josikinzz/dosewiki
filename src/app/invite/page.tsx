import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import { buildNoIndexPageMetadata, STATUS_PAGE_PATHS } from "@server/next/statusRedirectPolicy";
import { authRuntimePolicy } from "@server/auth/runtimePolicy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { StatusFact, StatusPageShell } from "../_components/StatusPageShell";
import { InviteRedeemForm } from "./InviteRedeemForm";
import { RoleGuide } from "@/features/dev/tools/members/RoleGuide";
import { INVITABLE_ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Accept invite",
  description: "Create your dose.wiki editor account from an invite code.",
  pathname: STATUS_PAGE_PATHS.invite,
});

type InvitePageProps = {
  searchParams?: Promise<{
    code?: string;
  }>;
};

/**
 * The page an invite link opens. No session is involved: the code is the
 * credential, checked by `/api/invite/redeem` when the form submits, after
 * which the form signs in with the new username and password. Someone who is
 * already signed in has nothing to redeem and goes to the editor.
 */
export default async function InvitePage({ searchParams }: InvitePageProps) {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect(STATUS_PAGE_PATHS.dev);
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialCode = resolvedSearchParams?.code?.trim() ?? "";
  const inlineCodeClassName =
    "rounded-md border border-subtle bg-subtle px-1.5 py-0.5 text-[0.92em] text-primary";

  return (
    <StatusPageShell
      badge="Editor access"
      badgeVariant="success"
      statusIcon="lucide:key"
      statusTone="success"
      title="Accept your invite"
      description={
        <>
          Someone on the dose.wiki team invited you. Choose a username and password to create your
          account; the invite decides which role you get. What each role means is spelled out below the form.
        </>
      }
      actions={
        <Button asChild variant="ghost">
          <Link href={STATUS_PAGE_PATHS.signIn}>Already have an account? Sign in</Link>
        </Button>
      }
      complementHeading="Access details"
      complement={
        <>
          <StatusFact
            tone="plain"
            label="Email"
            value={
              <>
                Optional. Without one, your account is keyed as{" "}
                <code className={inlineCodeClassName}>username@members.dose.wiki</code>.
              </>
            }
          />
          <StatusFact
            tone="plain"
            label="After sign-up"
            value={<code className={`${inlineCodeClassName} break-all`}>{STATUS_PAGE_PATHS.dev}</code>}
          />
        </>
      }
    >
      {authRuntimePolicy.sessionsAvailable ? (
        <>
          <InviteRedeemForm initialCode={initialCode} destination={STATUS_PAGE_PATHS.dev} />
          <section aria-labelledby="invite-roles-heading" className="mt-8">
            <h2 id="invite-roles-heading" className="text-base font-semibold theme-text-primary">
              Editor or contributor
            </h2>
            <p className="theme-text-secondary mt-1 text-sm">
              Your code names one of these. Nothing an editor writes reaches the site until an admin approves it.
            </p>
            <div className="mt-4">
              <RoleGuide roles={INVITABLE_ROLE_DESCRIPTIONS} />
            </div>
          </section>
        </>
      ) : (
        <Alert variant="warning">
          <Icon icon="lucide:triangle-alert" size={16} />
          <AlertTitle>Sign-in is not configured</AlertTitle>
          <AlertDescription>
            Set <code className={inlineCodeClassName}>AUTH_SECRET</code> on this deployment before invites
            can be accepted.
          </AlertDescription>
        </Alert>
      )}
    </StatusPageShell>
  );
}
