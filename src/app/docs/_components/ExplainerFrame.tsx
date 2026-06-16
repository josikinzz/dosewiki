"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { THEME_STORAGE_KEY, isThemeName, type ThemeName } from "@/theme";

const INTERNAL_FRAME_SCROLL_QUERY = "(max-width: 767px), (hover: none) and (pointer: coarse)";

function readDocumentTheme(): ThemeName {
  const datasetTheme = document.documentElement.dataset.theme;
  if (isThemeName(datasetTheme)) {
    return datasetTheme;
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(storedTheme)) {
      return storedTheme;
    }
  } catch {
    // Keep the default dark theme when storage is unavailable.
  }

  return "dark";
}

function getFrameDocumentHeight(doc: Document) {
  const body = doc.body;
  const root = doc.documentElement;

  if (!body || !root) {
    return 0;
  }

  return Math.max(
    body.scrollHeight,
    body.offsetHeight,
    root.clientHeight,
    root.scrollHeight,
    root.offsetHeight,
  );
}

function applyFrameOverflowMode(doc: Document, useInternalFrameScroll: boolean) {
  const root = doc.documentElement;
  const body = doc.body;

  if (!root || !body) {
    return;
  }

  if (useInternalFrameScroll) {
    root.style.overflow = "";
    body.style.overflow = "";
    root.style.overscrollBehaviorY = "contain";
    body.style.overscrollBehaviorY = "contain";
    body.style.setProperty("-webkit-overflow-scrolling", "touch");
    return;
  }

  root.style.overflow = "hidden";
  root.style.overscrollBehaviorY = "";
  body.style.overflow = "hidden";
  body.style.overscrollBehaviorY = "";
  body.style.removeProperty("-webkit-overflow-scrolling");
}

function useInternalFrameScroll() {
  const [useInternalScroll, setUseInternalScroll] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(INTERNAL_FRAME_SCROLL_QUERY);
    const syncMediaQuery = () => setUseInternalScroll(mediaQuery.matches);

    syncMediaQuery();
    mediaQuery.addEventListener("change", syncMediaQuery);

    return () => {
      mediaQuery.removeEventListener("change", syncMediaQuery);
    };
  }, []);

  return useInternalScroll;
}

/**
 * Renders a self-contained explainer document while keeping the top-level page
 * scroll, footer, and theme behavior aligned with the rest of the site.
 */
export function ExplainerFrame({ src, title }: { src: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [theme, setTheme] = useState<ThemeName>("dark");
  const useInternalScroll = useInternalFrameScroll();

  useEffect(() => {
    setTheme(readDocumentTheme());

    const observer = new MutationObserver(() => {
      setTheme(readDocumentTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;

    if (!iframe || !doc?.documentElement || !doc.body) {
      return;
    }

    doc.documentElement.dataset.theme = theme;
    doc.documentElement.style.colorScheme = theme;
    applyFrameOverflowMode(doc, useInternalScroll);
    iframe.contentWindow?.dispatchEvent(new CustomEvent("dosewiki-theme-change", { detail: { theme } }));
  }, [theme, useInternalScroll]);

  const syncFrameHeight = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;

    if (!iframe || !doc?.documentElement || !doc.body) {
      return;
    }

    if (useInternalScroll) {
      iframe.style.removeProperty("height");
      return;
    }

    iframe.style.height = `${getFrameDocumentHeight(doc)}px`;
  }, [useInternalScroll]);

  const handleFrameLoad = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;

    resizeObserverRef.current?.disconnect();

    if (!iframe || !doc?.documentElement || !doc.body) {
      return;
    }

    doc.documentElement.dataset.theme = theme;
    doc.documentElement.style.colorScheme = theme;
    applyFrameOverflowMode(doc, useInternalScroll);
    iframe.contentWindow?.dispatchEvent(new CustomEvent("dosewiki-theme-change", { detail: { theme } }));

    syncFrameHeight();

    resizeObserverRef.current = new ResizeObserver(syncFrameHeight);
    resizeObserverRef.current.observe(doc.documentElement);
    resizeObserverRef.current.observe(doc.body);

    iframe.contentWindow?.removeEventListener("resize", syncFrameHeight);
    iframe.contentWindow?.addEventListener("resize", syncFrameHeight);
  }, [syncFrameHeight, theme, useInternalScroll]);

  useEffect(() => {
    const iframe = iframeRef.current;

    if (!iframe) {
      return;
    }

    iframe.addEventListener("load", handleFrameLoad);

    if (iframe.contentDocument?.readyState === "complete") {
      handleFrameLoad();
    }

    return () => {
      iframe.removeEventListener("load", handleFrameLoad);
    };
  }, [handleFrameLoad]);

  useEffect(() => {
    return () => {
      const iframe = iframeRef.current;
      resizeObserverRef.current?.disconnect();
      iframe?.contentWindow?.removeEventListener("resize", syncFrameHeight);
    };
  }, [syncFrameHeight]);

  return (
    <main
      id="main-content"
      className="theme-page-shell"
    >
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        scrolling={useInternalScroll ? "auto" : "no"}
        className="docs-explainer-frame"
        data-internal-scroll={useInternalScroll}
      />
    </main>
  );
}
