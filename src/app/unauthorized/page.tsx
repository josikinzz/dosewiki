import Link from "next/link";
import { buildPageMetadata } from "@server/next/metadata";
import { Button } from "@/components/ui/button";
import { StatusFact, StatusPageShell } from "../_components/StatusPageShell";

export const dynamic = "force-dynamic";
export const metadata = buildPageMetadata({
  title: "Unauthorized",
  description: "This route is restricted to authorized editor accounts.",
  pathname: "/unauthorized",
  noIndex: true,
});

type UnauthorizedPageProps = {
  searchParams?: Promise<{
    from?: string;
  }>;
};

export default async function UnauthorizedPage({ searchParams }: UnauthorizedPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const from = resolvedSearchParams?.from ?? "/dev";
  const inlineCodeClassName =
    "rounded-md border border-[color:var(--theme-border-subtle)] bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_78%,transparent)] px-1.5 py-0.5 text-[0.92em] text-[color:var(--theme-text-primary)]";

  return (
    <StatusPageShell
      badge="Access denied"
      badgeVariant="destructive"
      title="You do not have editor access"
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
            <Link href="/substances">Return to public site</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Use a different account</Link>
          </Button>
        </>
      }
      complement={
        <>
          <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">Authorization</p>
          <StatusFact label="Attempted route" value={<code className={inlineCodeClassName}>{from}</code>} />
          <StatusFact
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
