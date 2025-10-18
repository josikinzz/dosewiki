import { useMemo } from "react";
import { ShieldAlert, SquareArrowOutUpRight, X } from "lucide-react";
import type { CitationEntry } from "../../types/content";

interface HarmReductionBannerProps {
  citations: CitationEntry[];
  onDismiss?: () => void;
}

const RESOURCE_PATTERNS = [
  { key: "erowid", label: "Erowid", matches: ["erowid.org"] },
  { key: "tripsit", label: "TripSit", matches: ["tripsit.me", "tripsit.io", "tripsit"] },
  { key: "bluelight", label: "Bluelight", matches: ["bluelight.org"] },
  { key: "wikipedia", label: "Wikipedia", matches: ["wikipedia.org", "wikipedia.com"] },
] as const;

export function HarmReductionBanner({ citations, onDismiss }: HarmReductionBannerProps) {
  const links = useMemo(() => {
    if (!Array.isArray(citations)) {
      return [];
    }

    const entriesWithHref = citations.filter(
      (entry): entry is CitationEntry & { href: string } => Boolean(entry?.href),
    );

    return RESOURCE_PATTERNS.flatMap((resource) => {
      const match = entriesWithHref.find((entry) => {
        const href = entry.href?.toLowerCase();
        return Boolean(href && resource.matches.some((pattern) => href.includes(pattern)));
      });

      if (!match || !match.href) {
        return [];
      }

      return [
        {
          key: resource.key,
          label: resource.label,
          href: match.href,
        },
      ];
    });
  }, [citations]);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 shadow-[0_14px_36px_-22px_rgba(239,68,68,0.55)] transition duration-200 hover:border-red-300/50 hover:bg-red-500/15 hover:shadow-[0_18px_46px_-25px_rgba(239,68,68,0.65)]">
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-400/40 bg-red-500/20 text-red-200 transition hover:border-red-300/60 hover:bg-red-500/30 hover:text-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          aria-label="Dismiss harm reduction disclaimer"
        >
          <X className="h-4 w-4" aria-hidden="true" focusable="false" />
        </button>
      ) : null}
      <div className="flex gap-4 pr-10 text-sm text-red-100/90 md:pr-16">
        <ShieldAlert className="mt-1 h-12 w-12 flex-shrink-0 text-red-100" aria-hidden="true" focusable="false" />
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed text-red-100/90">
            <span className="flex-grow text-red-100/90">
              <span className="mr-1 font-semibold uppercase tracking-[0.25em] text-red-200/90">Disclaimer:</span>
              This webpage provides information on the basis of harm reduction and educational purposes. We are not
              responsible for your actions and implore you to consult with resources beyond this page...
            </span>
            {links.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {links.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-red-100/85 transition hover:border-red-300/60 hover:bg-red-500/30 hover:text-red-50"
                  >
                    <span>{link.label}</span>
                    <SquareArrowOutUpRight className="h-3 w-3" aria-hidden="true" focusable="false" />
                  </a>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
