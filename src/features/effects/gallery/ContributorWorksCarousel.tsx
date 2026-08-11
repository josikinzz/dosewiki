'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { PublicPill } from '@/components/common/PublicTokens';
import { PublicSectionHeading } from '@/components/layout/PublicPagePrimitives';
import { focusRingClassName } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import type { GalleryReplication } from '@/types/replications';
import { GalleryMediaTile } from './GalleryMediaTile';

/**
 * A contributor's replications, as a rail you can step through.
 *
 * The track is a plain scroll-snap row, so it swipes on touch and still works
 * with no JavaScript at all; the arrows are a keyboard and mouse convenience on
 * top of that rather than the only way through. Stepping is clamped, not
 * circular — this is a finite body of work, and wrapping from the last piece
 * back to the first reads as the rail losing its place rather than as an end.
 */
interface ContributorWorksCarouselProps {
  works: readonly GalleryReplication[];
  /** Whose works these are; used to name the rail for assistive tech. */
  contributorName: string;
}

export function ContributorWorksCarousel({ works, contributorName }: ContributorWorksCarouselProps) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLUListElement | null>(null);
  const count = works.length;

  const step = (delta: number) => {
    const next = Math.min(Math.max(index + delta, 0), count - 1);
    if (next === index) {
      return;
    }

    setIndex(next);

    const target = trackRef.current?.children[next];
    if (target instanceof HTMLElement) {
      // Read at event time rather than held in state: this is the only place
      // the preference matters, and reading it here keeps the component free of
      // a media-query effect that would have to run on the server too.
      const reducedMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      target.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'start',
      });
    }
  };

  /** Left/right arrows step the rail, bound to the controls that already have focus. */
  const handleArrowKeys = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  };

  // An artist with nothing credited to them renders no section at all, the same
  // way the trip reports section stays absent rather than showing an empty shell.
  if (count === 0) {
    return null;
  }

  return (
    <section className="space-y-5">
      <PublicSectionHeading
        icon="lucide:images"
        title="Replications"
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
        aria-label={`Replications by ${contributorName}`}
        className="flex snap-x snap-mandatory list-none gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
      >
        {works.map((work) => (
          <li key={work._id} className="shrink-0 snap-start">
            <GalleryMediaTile replication={work} frameClassName="h-44 sm:h-52" />
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
  direction: 'previous' | 'next';
  contributorName: string;
  disabled: boolean;
  onStep: (delta: number) => void;
  onArrowKeys: (event: React.KeyboardEvent) => void;
}) {
  const isNext = direction === 'next';

  return (
    <button
      type="button"
      onClick={() => onStep(isNext ? 1 : -1)}
      onKeyDown={onArrowKeys}
      disabled={disabled}
      aria-label={
        isNext
          ? `Next replication by ${contributorName}`
          : `Previous replication by ${contributorName}`
      }
      className={cn(
        'theme-text-muted flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
        'border-[color:var(--theme-border-subtle)] hover:text-[var(--theme-accent-strong)] hover:border-[color:var(--theme-card-border-strong)]',
        'disabled:pointer-events-none disabled:opacity-40',
        focusRingClassName,
      )}
    >
      <Icon icon={isNext ? 'lucide:chevron-right' : 'lucide:chevron-left'} className="h-4 w-4" />
    </button>
  );
}
