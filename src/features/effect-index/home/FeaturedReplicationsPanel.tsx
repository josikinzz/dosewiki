"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { getCreatorByline } from "@/features/effects/components/replicationCredit";
import { publicHref } from "@/utils/publicHref";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import { HomePanel } from "./HomePanel";
import type { HomeFeaturedReplication } from "./homeModel";

/**
 * The Featured Replications panel, ported from `components/home/FeaturedReplications.vue`.
 *
 * One item at a time with prev/next chevrons, as the original had it. Clicking the stage now
 * opens the replication's own page, which carries the credit and licence that the old theater
 * viewer used to show in a toolbar — and unlike the modal, it can be linked to.
 *
 * The caption band over the stage is retained deliberately: this is a faithful port of the
 * legacy Effect Index carousel, captioned on a fixed dark stage in that flavor's on-dark
 * palette. It is not the gallery-tile hover overlay that was removed elsewhere.
 *
 * Nearly every curated item is a video (the legacy `gfycat` type), so the resting state
 * autoplays a muted loop the way the original's embed did. That is suppressed under
 * `prefers-reduced-motion`, where the first frame stands in and the reader opens the theater
 * to play it.
 */

/**
 * The stage and everything on it read against arbitrary dark media, so their colours cannot
 * come from the light/dark text ramp — they are fixed the way the original's were. They are
 * taken from the Effect Index palette's own on-dark family (`--ei-chrome-dark`,
 * `--ei-on-dark`, `--ei-teal-on-dark`), which is the same set that dresses the site's dark
 * header and footer, with the literal kept as a fallback for any flavor that lacks them.
 */
const STAGE_BACKGROUND = "bg-[color:var(--ei-chrome-dark,#2e2e2e)]";
const ON_DARK_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ei-on-dark,#f2f2f0)]";

const CONTROL_CLASS =
  "absolute top-1/2 z-10 flex h-24 w-11 -translate-y-1/2 items-center justify-center text-[color:var(--ei-on-dark-muted,#cccccc)] transition-colors hover:text-[color:var(--ei-on-dark,#f2f2f0)] focus-visible:outline-offset-2 [filter:drop-shadow(0_0_4px_rgb(0_0_0/0.8))]";

/** The caption's effect link. Teal on charcoal, not the deep teal used on paper. */
const CAPTION_LINK_CLASS =
  "pointer-events-auto text-[color:var(--ei-teal-on-dark,#6fc4bb)] transition-colors hover:underline hover:decoration-1 hover:underline-offset-2 focus-visible:outline-offset-2";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

interface FeaturedReplicationsPanelProps {
  items: readonly HomeFeaturedReplication[];
  stub: React.ReactNode;
}

export function FeaturedReplicationsPanel({ items, stub }: FeaturedReplicationsPanelProps) {
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  const count = items.length;

  const step = useCallback(
    (delta: number) => {
      if (count === 0) {
        return;
      }

      setIndex((current) => (current + delta + count) % count);
    },
    [count],
  );

  /**
   * Left/right arrows step the carousel. Bound to each control rather than to the stage
   * wrapper: the wrapper is a non-interactive `role="group"`, so a listener there would only
   * ever fire for focus that is already on one of these buttons anyway.
   */
  const handleArrowKeys = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    },
    [step],
  );

  // A curated list that resolves to nothing renders no panel at all rather than an empty
  // stage. Hooks stay above this so their order never depends on the data.
  if (count === 0) {
    return null;
  }

  const safeIndex = Math.min(index, count - 1);
  const item = items[safeIndex];
  const { replication } = item;
  const byline = getCreatorByline(replication);
  const isVideo = replication.type === "video";

  return (
    <HomePanel
      title="Featured Replications"
      description="Artistic representations of specific subjective effects"
      icon="lucide:images"
      stub={stub}
      contentClassName="p-3"
    >
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Featured replications"
        className={`relative h-[250px] w-full overflow-hidden border border-dose-border ${STAGE_BACKGROUND}`}
      >
        <Link
          href={publicHref.replication(replication.slug)}
          onKeyDown={handleArrowKeys}
          aria-label={`View ${replication.title}`}
          className={`absolute inset-0 flex h-full w-full items-center justify-center focus-visible:-outline-offset-2 ${ON_DARK_FOCUS_RING}`}
        >
          {isVideo ? (
            <video
              key={replication.slug}
              src={replication.url}
              poster={replication.thumbnail_url}
              muted
              loop
              playsInline
              autoPlay={!reducedMotion}
              preload="metadata"
              className="h-full w-full object-contain"
            />
          ) : (
            <AppImage
              src={replication.url}
              alt={replication.title}
              width={replication.width ?? 800}
              height={replication.height ?? 600}
              className="h-full w-full object-contain"
            />
          )}
        </Link>

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              onKeyDown={handleArrowKeys}
              aria-label="Previous replication"
              className={`${CONTROL_CLASS} ${ON_DARK_FOCUS_RING} left-0`}
            >
              <Icon icon="lucide:chevrons-left" size={30} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              onKeyDown={handleArrowKeys}
              aria-label="Next replication"
              className={`${CONTROL_CLASS} ${ON_DARK_FOCUS_RING} right-0`}
            >
              <Icon icon="lucide:chevrons-right" size={30} />
            </button>
          </>
        ) : null}

        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/60 to-transparent px-3 pb-3 pt-10 text-center text-[0.9375rem] leading-snug text-[color:var(--ei-on-dark,#f2f2f0)] [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]"
        >
          <p>
            {item.introduction}
            <Link
              href={getPublicRoutePath({
                family: "effect",
                params: { effectSlug: item.effectSlug },
              })}
              className={`${CAPTION_LINK_CLASS} ${ON_DARK_FOCUS_RING}`}
            >
              {item.effectName}
            </Link>
          </p>
          <p className="mt-0.5 text-[0.8125rem] italic text-[color:var(--ei-on-dark-muted,#cccccc)]">
            {byline}
          </p>
        </div>
      </div>

    </HomePanel>
  );
}
