import type { Metadata } from "next";
import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";

export const metadata: Metadata = {
  title: "dose.wiki is under construction",
  description: "dose.wiki is preparing its public harm-reduction library.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UnderConstructionPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-[var(--theme-body-bg)] px-6 py-12 text-[var(--theme-text-primary)] focus:outline-none"
    >
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-3xl flex-col items-center justify-center text-center">
        <DoseWikiLogo className="mb-8 h-20 w-20" ariaHidden height={80} width={80} />
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-text-muted)]">
          Public launch in progress
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl">
          dose<span className="theme-accent-heading">.wiki</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-[var(--theme-text-secondary)] sm:text-lg">
          The public site is under construction while the harm-reduction library is being reviewed.
        </p>
      </div>
    </main>
  );
}
