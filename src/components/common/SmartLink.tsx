"use client";

import Link, { useLinkStatus } from "next/link";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type FocusEvent,
  type PointerEvent,
  type Ref,
} from "react";

/**
 * How long a navigation must stay in flight before the clicked link and the
 * global progress bar announce it. Prefetched navigations usually commit well
 * inside this window, so fast transitions stay visually silent.
 */
const PENDING_FEEDBACK_DELAY_MS = 150;

/* ----------------------------------------------------------------------------
 * Global pending-navigation store
 *
 * Each in-flight SmartLink navigation registers here after the feedback delay.
 * `NavigationProgress` (mounted once in the route chrome) subscribes to render
 * the top-of-page progress bar. A counter (not a boolean) keeps rapid
 * double-clicks and overlapping navigations honest.
 * ------------------------------------------------------------------------- */

let pendingNavigationCount = 0;
const pendingListeners = new Set<() => void>();

function subscribeToPendingNavigation(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

function readPendingNavigation(): boolean {
  return pendingNavigationCount > 0;
}

function trackPendingNavigation(): () => void {
  pendingNavigationCount += 1;
  for (const listener of pendingListeners) listener();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pendingNavigationCount -= 1;
    for (const listener of pendingListeners) listener();
  };
}

/**
 * Whether any SmartLink navigation has been in flight longer than the
 * feedback delay. Drives the route chrome's `NavigationProgress` bar.
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
 * context. While a navigation from this link is pending past the feedback
 * delay, it marks the anchor with `data-nav-pending="true"` (styled in
 * utilities-theme.css) and registers with the global store above.
 */
function PendingBeacon({ anchorRef }: { anchorRef: React.RefObject<HTMLAnchorElement | null> }) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    let release: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      anchorRef.current?.setAttribute("data-nav-pending", "true");
      release = trackPendingNavigation();
    }, PENDING_FEEDBACK_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      anchorRef.current?.removeAttribute("data-nav-pending");
      release?.();
    };
  }, [pending, anchorRef]);

  return null;
}

/* ----------------------------------------------------------------------------
 * SmartLink
 * ------------------------------------------------------------------------- */

export type SmartLinkProps = Omit<ComponentProps<typeof Link>, "prefetch">;

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
 * Whatever latency remains is made visible instead of silent: once a
 * navigation is pending past a short delay, the clicked anchor gains
 * `data-nav-pending="true"` (dim + progress cursor) and the route chrome's
 * `NavigationProgress` bar appears.
 *
 * For the handful of always-visible, high-value links (header nav, home
 * tiles), keep plain `next/link` and its default viewport prefetch.
 */
export function SmartLink({
  href,
  children,
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
      prefetch={false}
      ref={setAnchor}
      onPointerEnter={handlePointerEnter}
      onFocus={handleFocus}
    >
      {children}
      <PendingBeacon anchorRef={anchorRef} />
    </Link>
  );
}
