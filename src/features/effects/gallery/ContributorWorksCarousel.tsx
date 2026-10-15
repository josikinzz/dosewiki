"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { GalleryReplication } from "@/types/replications";
import { GalleryMediaTile } from "./GalleryMediaTile";
import { artistUrlKey, isWithheldFromArtistViews } from "./galleryArtistIdentity";
import {
  buildGalleryFocusUrl,
  buildReplicationViewerUrl,
} from "@/features/replications/galleryUrlState";

interface ContributorWorksCarouselProps {
  works: readonly GalleryReplication[];
  contributorName: string;
}

export function ContributorWorksCarousel({
  works,
  contributorName,
}: ContributorWorksCarouselProps) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLUListElement | null>(null);

  const shown = useMemo(
    () => works.filter((work) => !isWithheldFromArtistViews(work)),
    [works],
  );
  const count = shown.length;

  const step = (delta: number) => {
    const next = Math.min(Math.max(index + delta, 0), count - 1);
    if (next === index) {
      return;
    }

    setIndex(next);

    const target = trackRef.current?.children[next];
    if (target instanceof HTMLElement) {
      const reducedMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      target.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  };

  const handleArrowKeys = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  };

  if (count === 0) {
    return null;
  }

  return (
    <section className="space-y-5">
      <PublicSectionHeading
        icon="lucide:images"
        title={t("Replications")}
        titleElement="h2"
        actions={
          <>
            <PublicPill tone="neutral" size="sm">
              {count}
            </PublicPill>
            {count > 1 ? (
              <div className="flex items-center gap-1">
                <RailButton
                  direction="previous"
                  contributorName={contributorName}
                  disabled={index === 0}
                  onStep={step}
                  onArrowKeys={handleArrowKeys}
                />
                <RailButton
                  direction="next"
                  contributorName={contributorName}
                  disabled={index === count - 1}
                  onStep={step}
                  onArrowKeys={handleArrowKeys}
                />
              </div>
            ) : null}
          </>
        }
      />

      <ul
        ref={trackRef}
        aria-label={t("Replications by {{artist}}", { artist: contributorName })}
        className="flex snap-x snap-mandatory list-none gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
      >
        {shown.map((work) => (
          <li key={work._id} className="shrink-0 snap-start">
            <GalleryMediaTile
              replication={work}
              frameClassName="h-44 sm:h-52"
              viewerHref={buildReplicationViewerUrl(
                buildGalleryFocusUrl({
                  kind: "artist",
                  key: artistUrlKey(work.artist),
                }),
                work.slug,
              )}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RailButton({
  direction,
  contributorName,
  disabled,
  onStep,
  onArrowKeys,
}: {
  direction: "previous" | "next";
  contributorName: string;
  disabled: boolean;
  onStep: (delta: number) => void;
  onArrowKeys: (event: React.KeyboardEvent) => void;
}) {
  const t = useT();
  const isNext = direction === "next";

  return (
    <button
      type="button"
      onClick={() => onStep(isNext ? 1 : -1)}
      onKeyDown={onArrowKeys}
      disabled={disabled}
      aria-label={
        isNext
          ? t("Next replication by {{artist}}", { artist: contributorName })
          : t("Previous replication by {{artist}}", { artist: contributorName })
      }
      className={cn(
        "theme-text-muted flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
        "border-[color:var(--theme-border-subtle)] hover:text-[var(--theme-accent-strong)] hover:border-[color:var(--theme-card-border-strong)]",
        "disabled:pointer-events-none disabled:opacity-40",
        focusRingClassName,
      )}
    >
      <Icon
        icon={isNext ? "lucide:chevron-right" : "lucide:chevron-left"}
        className="h-4 w-4"
      />
    </button>
  );
}
