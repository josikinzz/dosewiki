import Link from "next/link";
import { buildPageMetadata } from "@server/next/metadata";
import { Button } from "@/components/ui/button";

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

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl items-center px-4 py-16 focus:outline-none">
      <section className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-fuchsia-950/20 backdrop-blur">
        <div className="inline-flex rounded-full border border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-danger-text)]">
          Access denied
        </div>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-white">
          You do not have editor access
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">
          Your account signed in successfully, but it does not currently have the right role for <code>{from}</code>.
          Ask an admin to grant the <code>editor</code> or <code>admin</code> role in Convex memberships.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button asChild variant="secondary">
            <Link href="/substances">Return to public site</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Use a different account</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
