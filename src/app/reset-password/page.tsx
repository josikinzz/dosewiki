import Link from "next/link";
import { buildNoIndexPageMetadata, STATUS_PAGE_PATHS } from "@server/next/statusRedirectPolicy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { StatusPageShell } from "../_components/StatusPageShell";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Reset password",
  description: "Set a new password for your dose.wiki editor account.",
  pathname: STATUS_PAGE_PATHS.resetPassword,
});

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

/**
 * The page an admin-issued reset link opens. No session is involved: the
 * token in the URL is the credential, checked by `/api/reset-password` when
 * the form submits. A link without a token still renders, with an
 * explanation instead of the form, so a mangled paste is not a blank page.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const token = resolvedSearchParams?.token?.trim() ?? "";

  return (
    <StatusPageShell
      badge="Editor access"
      badgeVariant="success"
      statusIcon="lucide:key-round"
      statusTone="success"
      title="Set a new password"
      description={
        <>
          An admin issued this link for your account. It works once and expires an hour after it was
          issued.
        </>
      }
      actions={
        <Button asChild variant="ghost">
          <Link href={STATUS_PAGE_PATHS.signIn}>Back to sign in</Link>
        </Button>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert variant="warning">
          <Icon icon="lucide:triangle-alert" size={16} />
          <AlertTitle>This link is missing its token</AlertTitle>
          <AlertDescription>
            Open the full reset link exactly as it was sent to you, or ask an admin for a new one.
          </AlertDescription>
        </Alert>
      )}
    </StatusPageShell>
  );
}
