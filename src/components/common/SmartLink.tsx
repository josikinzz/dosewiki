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

export function useNavigationPending(): boolean {
  return useSyncExternalStore(
    subscribeToPendingNavigation,
    readPendingNavigation,
    () => false,
  );
}

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

export type SmartLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  eager?: boolean;
};

function canIntentPrefetch(href: SmartLinkProps["href"]): href is string {
  if (typeof href !== "string" || !href.startsWith("/")) return false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return connection?.saveData !== true;
}

export function SmartLink({
  href,
  children,
  eager = false,
  onPointerEnter,
  onFocus,
  ref,
  ...rest
}: SmartLinkProps) {
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
