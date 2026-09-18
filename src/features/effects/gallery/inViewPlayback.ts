import { useEffect, useRef, useState } from 'react';

/**
 * Shared playback budget for in-view video previews.
 *
 * A wall of autoplaying videos is a decode/battery problem, so surfaces that
 * autoplay several previews (currently the replication studio's playlist)
 * cap how many run at once. The pool is most-recent-wins: a new request
 * always succeeds, and when the pool is over capacity the holder whose claim
 * is stalest gets revoked. A revoked tile stays paused until it re-requests
 * (by leaving and re-entering the viewport, or by being hovered).
 */
export interface PlaybackSlotPool {
  /**
   * Claim (or refresh) a slot for `key`. Always grants; may synchronously
   * revoke the stalest other holder to stay within capacity. Re-requesting
   * an already-held key refreshes its recency and its revoke callback.
   */
  request(key: object, onRevoke: () => void): void;
  /** Give the slot back without triggering `onRevoke`. Unknown keys are a no-op. */
  release(key: object): void;
  /** Whether `key` currently holds a slot. */
  has(key: object): boolean;
}

export function createPlaybackSlotPool(capacity: number): PlaybackSlotPool {
  /** Insertion order = recency order: first entry is the stalest claim. */
  const holders = new Map<object, () => void>();
  return {
    request(key, onRevoke) {
      holders.delete(key);
      holders.set(key, onRevoke);
      while (holders.size > capacity) {
        const [stalestKey, revoke] = holders.entries().next().value as [object, () => void];
        holders.delete(stalestKey);
        revoke();
      }
    },
    release(key) {
      holders.delete(key);
    },
    has(key) {
      return holders.has(key);
    },
  };
}

/**
 * Hold a slot in `pool` while `active`; returns whether the slot is currently
 * granted. Changing `refresh` re-requests the slot, which bumps this holder's
 * recency and revives a revoked claim — pass the tile's hover state so the
 * tile the reader is pointing at always wins a slot.
 */
export function usePlaybackSlot(
  active: boolean,
  refresh: unknown,
  pool: PlaybackSlotPool,
): boolean {
  // One stable identity per component instance; the pool keys on it.
  const keyRef = useRef<object>({});
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    if (!active) return;
    const key = keyRef.current;
    pool.request(key, () => setGranted(false));
    setGranted(true);
    return () => {
      pool.release(key);
      setGranted(false);
    };
  }, [active, refresh, pool]);
  return granted;
}

export interface PlaybackAllowances {
  /**
   * In-view autoplay of muted preview renditions. Readers with
   * `prefers-reduced-motion` or Save-Data get the poster, the video chip,
   * and click-through playback on the detail page.
   */
  autoplay: boolean;
  /**
   * Hover-to-play previews: a hover-capable fine pointer and no
   * reduced-motion or Save-Data preference. Gallery tiles gate all playback
   * on this, so touch devices and data-saving readers get static tiles.
   */
  hoverPreview: boolean;
}

interface NetworkInformationLike {
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

/**
 * Consolidated motion/data gates for gallery playback. SSR renders both
 * gates closed; the client opens them after mount, so no video work ever
 * happens during hydration.
 */
export function useMotionAllowed(): PlaybackAllowances {
  const [allowances, setAllowances] = useState<PlaybackAllowances>({
    autoplay: false,
    hoverPreview: false,
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike })
      .connection;
    const update = () => {
      const reduced = motion.matches;
      setAllowances({
        autoplay: !reduced && !connection?.saveData,
        hoverPreview: pointer.matches && !reduced && !connection?.saveData,
      });
    };
    update();
    pointer.addEventListener('change', update);
    motion.addEventListener('change', update);
    connection?.addEventListener?.('change', update);
    return () => {
      pointer.removeEventListener('change', update);
      motion.removeEventListener('change', update);
      connection?.removeEventListener?.('change', update);
    };
  }, []);
  return allowances;
}

/**
 * Whether `ref`'s element is at least `threshold` visible. Observes nothing
 * while `enabled` is false (image tiles never pay for an observer). Without
 * IntersectionObserver support the answer is a conservative `false`:
 * no observer, no autoplay.
 */
export function useInView(
  ref: React.RefObject<Element | null>,
  threshold: number,
  enabled: boolean,
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setInView(false);
      return;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Fast scrolls batch transitions; only the newest entry is current.
        setInView(entries[entries.length - 1].isIntersecting);
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, enabled]);
  return inView;
}
