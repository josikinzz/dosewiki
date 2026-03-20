import Link from "next/link";
import { buildPageMetadata } from "@server/next/metadata";

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
    <main className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl items-center px-4 py-16">
      <section className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-fuchsia-950/20 backdrop-blur">
        <div className="inline-flex rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">
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
          <Link
            href="/substances"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10 hover:text-white"
          >
            Return to public site
          </Link>
          <Link
            href="/sign-in"
            className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:text-white"
          >
            Use a different account
          </Link>
        </div>
      </section>
    </main>
  );
}
