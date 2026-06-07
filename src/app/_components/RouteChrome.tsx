"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { RouteAnnouncer } from "@/components/common/RouteAnnouncer";
import { viewToPath } from "@/utils/routing";
import { getRouteChromeModel } from "@/utils/routeChrome";

function useRouteChromeModel() {
  const pathname = usePathname();
  return useMemo(() => getRouteChromeModel(pathname), [pathname]);
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function resetDocumentScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function schedulePostNavigationScrollReset() {
  resetDocumentScroll();

  const timeoutIds = [0, 50, 150].map((delay) => window.setTimeout(resetDocumentScroll, delay));
  const frameId = window.requestAnimationFrame?.(() => {
    resetDocumentScroll();
  });

  return () => {
    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));

    if (frameId !== undefined) {
      window.cancelAnimationFrame?.(frameId);
    }
  };
}

export function useResetScrollOnPathnameChange(pathname: string) {
  const previousPathnameRef = useRef(pathname);

  useIsomorphicLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    if (previousPathname === pathname || window.location.hash) {
      return;
    }

    return schedulePostNavigationScrollReset();
  }, [pathname]);
}

export function RouteChrome() {
  const router = useRouter();
  const pathname = usePathname();
  const model = useRouteChromeModel();
  useResetScrollOnPathnameChange(pathname);

  return (
    <>
      <RouteAnnouncer message={model.pageTitle} />
      <Header model={model} onNavigate={(nextView) => router.push(viewToPath(nextView))} />
    </>
  );
}

export function RouteFooter() {
  const pathname = usePathname();
  const model = useRouteChromeModel();

  if (pathname === "/") {
    return null;
  }

  return <Footer model={model} />;
}
