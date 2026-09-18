import Link from "next/link";
import {
  buildNoIndexPageMetadata,
  getUnauthorizedFrom,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { getStatusRecoveryLink } from "@server/next/statusRecoveryLinks";
import { Button } from "@/components/ui/button";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { SignOutButton } from "../_components/SignOutButton";
import { StatusFact, StatusPageShell } from "../_components/StatusPageShell";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Unauthorized",
  description: "This route is restricted to authorized editor accounts.",
  pathname: STATUS_PAGE_PATHS.unauthorized,
});

type UnauthorizedPageProps = {
  searchParams?: Promise<{
    from?: string;
  }>;
};

export default async function UnauthorizedPage({ searchParams }: UnauthorizedPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const copy = await getCopyByKeys(["unauthorized-badge", "unauthorized-title"]);
  const from = getUnauthorizedFrom(resolvedSearchParams?.from);
  const publicSiteLink = getStatusRecoveryLink("substances");
  const inlineCodeClassName =
    "rounded-md border border-[color:var(--theme-border-subtle)] bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_78%,var(--theme-body-bg))] px-1.5 py-0.5 text-[0.92em] text-[color:var(--theme-text-primary)]";

  return (
    <StatusPageShell
      badge={copy.text("unauthorized-badge") || "Access denied"}
      badgeVariant="destructive"
      title={copy.text("unauthorized-title") || "You do not have editor access"}
      description={
        <>
          Your account signed in successfully, but it does not have the role{" "}
          <code className={inlineCodeClassName}>{from}</code> requires. Access is by invitation: ask an admin to
          invite you at the role you need, or to raise the role on your existing account.
        </>
      }
      actions={
        <>
          <Button asChild variant="secondary">
            <Link href={publicSiteLink.href}>Return to public site</Link>
          </Button>
          <SignOutButton callbackUrl={STATUS_PAGE_PATHS.signIn} variant="outline">
            Use a different account
          </SignOutButton>
          <Button asChild variant="ghost">
            <Link href={STATUS_PAGE_PATHS.invite}>Have an invite code?</Link>
          </Button>
        </>
      }
      complementHeading="Authorization"
      complement={
        <>
          <StatusFact tone="plain" label="Attempted route" value={<code className={inlineCodeClassName}>{from}</code>} />
          <StatusFact
            tone="plain"
            label="Required role"
            value={
              <>
                <code className={inlineCodeClassName}>contributor</code>,{" "}
                <code className={inlineCodeClassName}>editor</code>, or{" "}
                <code className={inlineCodeClassName}>admin</code>, depending on the route
              </>
            }
          />
        </>
      }
    />
  );
}
