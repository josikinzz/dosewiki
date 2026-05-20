"use client";

import { useMemo } from "react";
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
  const model = useRouteChromeModel();

  return (
    <>
      <RouteAnnouncer message={model.pageTitle} />
      <Header model={model} onNavigate={(nextView) => router.push(viewToPath(nextView))} />
    </>
  );
}

export function RouteFooter() {
  const model = useRouteChromeModel();

  return <Footer model={model} />;
}
