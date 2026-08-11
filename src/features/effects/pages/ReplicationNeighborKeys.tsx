'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ReplicationNeighborKeysProps {
  previousHref: string | null;
  nextHref: string | null;
}

/**
 * Arrow-key paging between replications. The visible prev/next links are the
 * real affordance and work without JS; this only adds the shortcut a gallery
 * viewer expects to still have once the lightbox is gone.
 *
 * Ignores keystrokes aimed at a field, a contenteditable region, or combined
 * with a modifier, so it never steals browser or text-caret navigation.
 */
export function ReplicationNeighborKeys({
  previousHref,
  nextHref,
}: ReplicationNeighborKeysProps) {
  const router = useRouter();

  useEffect(() => {
    if (!previousHref && !nextHref) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target && /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(target.tagName))
      ) {
        return;
      }

      const href = event.key === 'ArrowLeft' ? previousHref : nextHref;
      if (!href) return;

      event.preventDefault();
      router.push(href);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextHref, previousHref, router]);

  return null;
}
