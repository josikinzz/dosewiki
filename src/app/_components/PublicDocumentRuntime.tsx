"use client";

import type { ReactNode } from "react";
import { SITE_FLAVOR } from "@/config/siteFlavor";
import { EditorLauncherProvider } from "@/features/editor-launcher/EditorLauncherProvider.editor";
import { ThemeLabLazy } from "@/features/theme-lab/ThemeLabLazy";
import { ApprovedPublicAnalytics } from "./ApprovedPublicAnalytics";
import { RouteChrome, RouteFooter } from "./RouteChrome";
import { useT } from "@/i18n/client";

export default function PublicDocumentRuntime({ children }: { children: ReactNode }) {
  const t = useT();

  return (
    <>
      <ApprovedPublicAnalytics />
      <span data-nosnippet>
        <a href="#main-content" className="theme-skip-link theme-focus-ring sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:outline-none">
          {t("Skip to main content")}
        </a>
      </span>
      <EditorLauncherProvider>
        <RouteChrome />
        <div className="app-content relative">
          <div className="flex-1">{children}</div>
          <RouteFooter />
        </div>
        {SITE_FLAVOR === "dosewiki" ? <ThemeLabLazy /> : null}
      </EditorLauncherProvider>
    </>
  );
}
