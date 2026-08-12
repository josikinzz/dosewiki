import Link from "next/link";
import {
  buildNoIndexPageMetadata,
  getStatusRecoveryLink,
  getUnauthorizedFrom,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { Button } from "@/components/ui/button";
import { getCopy } from "@server/next/copyBlocks";
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
  const copy = await getCopy();
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
          Your account signed in successfully, but it does not currently have the required role for{" "}
          <code className={inlineCodeClassName}>{from}</code>. Ask an admin to grant the{" "}
          <code className={inlineCodeClassName}>editor</code> or <code className={inlineCodeClassName}>admin</code>{" "}
          role in Convex memberships.
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
                <code className={inlineCodeClassName}>editor</code> or <code className={inlineCodeClassName}>admin</code>
              </>
            }
          />
        </>
      }
    />
  );
}
