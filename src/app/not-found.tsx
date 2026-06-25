import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@server/next/metadata";
import { getStatusRecoveryLink } from "@server/next/statusRedirectPolicy";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = buildPageMetadata({
  title: "Page not found",
  description: "The page you requested does not exist or may have moved.",
  pathname: "/404",
  noIndex: true,
});

export default function NotFound() {
  const substancesLink = getStatusRecoveryLink("substances");
  const effectsLink = getStatusRecoveryLink("effects");
  const reportsLink = getStatusRecoveryLink("reports");

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center px-6 py-20 focus:outline-none"
    >
      <div className="relative">
        <div
          aria-hidden="true"
          className="theme-section-header-glow pointer-events-none absolute -left-10 -top-12 -z-10 h-32 w-64 rounded-full opacity-60 blur-3xl"
        />

        <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
          404
        </p>

        <h1 className="font-display mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Page not found
        </h1>

        <p className="theme-text-secondary mt-4 max-w-md text-base leading-7">
          That page doesn&rsquo;t exist or may have moved.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button asChild variant="accent" size="lg">
            <Link href={substancesLink.href}>Browse substances</Link>
          </Button>
          <div className="flex items-center gap-x-3 text-sm">
            <Link
              href={effectsLink.href}
              className="theme-text-muted rounded-sm py-1 underline-offset-4 transition-colors hover:text-dose-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"
            >
              {effectsLink.label}
            </Link>
            <span aria-hidden="true" className="theme-text-faint">
              &middot;
            </span>
            <Link
              href={reportsLink.href}
              className="theme-text-muted rounded-sm py-1 underline-offset-4 transition-colors hover:text-dose-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"
            >
              {reportsLink.label}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
