import { useEffect, useRef, useState } from 'react';

export interface PlaybackSlotPool {
  request(key: object, onRevoke: () => void): void;
  release(key: object): void;
  has(key: object): boolean;
}

export function createPlaybackSlotPool(capacity: number): PlaybackSlotPool {
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

export function usePlaybackSlot(
  active: boolean,
  refresh: unknown,
  pool: PlaybackSlotPool,
): boolean {
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
  autoplay: boolean;
  hoverPreview: boolean;
}

interface NetworkInformationLike {
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

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
        setInView(entries[entries.length - 1].isIntersecting);
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, enabled]);
  return inView;
}
