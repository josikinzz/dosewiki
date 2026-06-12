import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import type { CitationEntry } from "@/types/content";
import { Button } from "@/components/ui/button";
import { InteractiveSurface } from "@/components/ui/surface";

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

  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!isClosing) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      onDismiss?.();
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isClosing, onDismiss]);

  const handleDismissClick = () => {
    if (isClosing) {
      return;
    }
    setIsClosing(true);
  };

  return (
    <InteractiveSurface asChild variant="danger" padding="none" radius="xl" className="px-5 py-4">
      <section>
      {onDismiss && !isClosing ? (
        <Button
          variant="destructive"
          size="auto"
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full"
          onClick={handleDismissClick}
          aria-label="Dismiss harm reduction disclaimer"
        >
          <Icon icon="lucide:x" size={16} />
        </Button>
      ) : null}
      <div className="flex gap-4 pr-10 text-sm text-[color:var(--theme-danger-text)] md:pr-16">
        <Icon icon="lucide:shield-alert"
          size={isClosing ? 56 : 48}
          className={`${isClosing ? "" : "mt-1"} flex-shrink-0 text-[color:var(--theme-danger-text)] ${
            isClosing ? "animate-pulse" : ""
          }`}
        />
        <div className="flex flex-1 flex-col justify-center gap-3">
          {isClosing ? (
            <p className="w-full text-center text-lg font-semibold uppercase tracking-[0.5em] text-[color:var(--theme-danger-text)] animate-pulse">
              You Have Been Warned
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed text-[color:var(--theme-danger-text)]">
              <span className="flex-grow">
                <span className="mr-1 font-semibold uppercase tracking-[0.25em] text-[color:var(--theme-danger-text-strong)]">Disclaimer:</span>
                This webpage provides information on the basis of harm reduction and educational purposes. We are not
                responsible for your actions and implore you to consult with resources beyond this page.
              </span>
              {links.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {links.map((link) => (
                    <a
                      key={link.key}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-danger-text)] transition hover:border-[color:var(--theme-danger-border-strong)] hover:bg-[color:var(--theme-danger-bg-strong)] hover:text-[color:var(--theme-danger-text-strong)]"
                    >
                      <span>{link.label}</span>
                      <Icon icon="lucide:square-arrow-out-up-right" size={12} />
                    </a>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      </section>
    </InteractiveSurface>
  );
}
