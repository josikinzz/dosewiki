"use client";

import { useEffect, useMemo, useRef } from "react";
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

export function RouteChrome() {
  const router = useRouter();
  const pathname = usePathname();
  const model = useRouteChromeModel();
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    if (previousPathname !== "/" || pathname === "/") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  if (pathname === "/") {
    return null;
  }

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
