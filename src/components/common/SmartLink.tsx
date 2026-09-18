"use client";

import Link, { useLinkStatus } from "next/link";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type FocusEvent,
  type PointerEvent,
  type Ref,
} from "react";

/* ----------------------------------------------------------------------------
 * Global pending-navigation store
 *
 * Each in-flight navigation owns an identity here the moment it starts.
 * `NavigationProgress` subscribes to render the top-of-page progress bar.
 * Releasing one identity cannot clear another overlapping transition.
 * ------------------------------------------------------------------------- */

export type NavigationTransitionId = symbol;
const pendingNavigations = new Set<NavigationTransitionId>();
const pendingListeners = new Set<() => void>();

function subscribeToPendingNavigation(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

function readPendingNavigation(): boolean {
  return pendingNavigations.size > 0;
}

function emitPendingNavigationChange() {
  for (const listener of pendingListeners) listener();
}

export function beginPendingNavigation(): NavigationTransitionId {
  const id = Symbol("pending-navigation");
  pendingNavigations.add(id);
  emitPendingNavigationChange();
  return id;
}

export function finishPendingNavigation(id: NavigationTransitionId): void {
  if (!pendingNavigations.delete(id)) return;
  emitPendingNavigationChange();
}

/**
 * Whether any SmartLink navigation is in flight. Drives the route chrome's
 * `NavigationProgress` bar.
 */
export function useNavigationPending(): boolean {
  return useSyncExternalStore(
    subscribeToPendingNavigation,
    readPendingNavigation,
    () => false,
  );
}

/* ----------------------------------------------------------------------------
 * Pending beacon
 * ------------------------------------------------------------------------- */

/**
 * Rendered inside the anchor so it can read the per-link `useLinkStatus`
 * context. While a navigation from this link is pending, it marks the anchor
 * with `data-nav-pending="true"` (styled in utilities-theme.css) and
 * registers with the global store above.
 *
 * A layout effect, not a passive one: the attribute lands in the same frame
 * as the optimistic pending render, so the click answers on the very next
 * paint. There is deliberately no feedback delay. Even a prefetched
 * navigation that commits in a few frames gets its glint and the bar's
 * finish sweep, so the eye always sees the click register.
 */
function PendingBeacon({ anchorRef }: { anchorRef: React.RefObject<HTMLAnchorElement | null> }) {
  const { pending } = useLinkStatus();

  useLayoutEffect(() => {
    if (!pending) return;
    anchorRef.current?.setAttribute("data-nav-pending", "true");
    const transitionId = beginPendingNavigation();
    return () => {
      anchorRef.current?.removeAttribute("data-nav-pending");
      finishPendingNavigation(transitionId);
    };
  }, [pending, anchorRef]);

  return null;
}

/* ----------------------------------------------------------------------------
 * SmartLink
 * ------------------------------------------------------------------------- */

export type SmartLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  /**
   * Keep `next/link`'s viewport prefetching instead of waiting for hover or
   * focus. For a fixed, small set such as the home link and homepage tile grid, the
   * speculative fetch can be worth paying on sight. Expensive indexes and
   * secondary article destinations should keep the default intent-only policy.
   */
  eager?: boolean;
};

function canIntentPrefetch(href: SmartLinkProps["href"]): href is string {
  if (typeof href !== "string" || !href.startsWith("/")) return false;
  // Respect explicit data-saver requests: the click itself still navigates.
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return connection?.saveData !== true;
}

/**
 * Drop-in replacement for `next/link` on high-cardinality public surfaces.
 *
 * Index and article pages render hundreds of links, so viewport prefetching
 * (the `next/link` default) is kept off to avoid speculatively downloading
 * hundreds of route payloads. Instead, SmartLink prefetches on navigation
 * intent — pointer enter, or keyboard focus — which typically overlaps the
 * whole fetch with the user's hover-to-click delay, making the navigation
 * feel instant. On touch devices, pointer enter fires at touch start, ahead
 * of the click by the tap duration.
 *
 * Whatever latency remains is made visible instead of silent: the moment a
 * navigation is pending, the clicked anchor gains `data-nav-pending="true"`
 * (dim + progress cursor; index entries shimmer instead) and the route
 * chrome's `NavigationProgress` bar appears.
 *
 * For the handful of always-visible, high-value links (home and home tiles),
 * pass `eager` to keep viewport prefetching.
 */
export function SmartLink({
  href,
  children,
  eager = false,
  onPointerEnter,
  onFocus,
  ref,
  ...rest
}: SmartLinkProps) {
  // Same null-tolerant context read `next/link` itself uses, instead of
  // `useRouter()`, which throws without a mounted app router. Keeps SmartLink
  // renderable in jsdom tests and the /dev/kit static prerender, where
  // next/link has always tolerated the absent router.
  const router = useContext(AppRouterContext);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);

  const setAnchor = useCallback(
    (node: HTMLAnchorElement | null) => {
      anchorRef.current = node;
      const forwarded = ref as Ref<HTMLAnchorElement> | undefined;
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [ref],
  );

  // The Next 16 segment cache dedupes and staleness-checks by href, so
  // re-firing on every intent signal is a cheap no-op while fresh and a
  // self-healing refetch once the cached payload has expired.
  const prefetchOnIntent = useCallback(() => {
    if (router && canIntentPrefetch(href)) router.prefetch(href);
  }, [href, router]);

  const handlePointerEnter = useCallback(
    (event: PointerEvent<HTMLAnchorElement>) => {
      onPointerEnter?.(event);
      prefetchOnIntent();
    },
    [onPointerEnter, prefetchOnIntent],
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLAnchorElement>) => {
      onFocus?.(event);
      prefetchOnIntent();
    },
    [onFocus, prefetchOnIntent],
  );

  return (
    <Link
      {...rest}
      href={href}
      prefetch={eager ? undefined : false}
      ref={setAnchor}
      onPointerEnter={handlePointerEnter}
      onFocus={handleFocus}
    >
      {children}
      <PendingBeacon anchorRef={anchorRef} />
    </Link>
  );
}
