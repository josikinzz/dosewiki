"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { THEME_STORAGE_KEY, isThemeName, type ThemeName } from "@/theme";

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

  return Math.max(
    body.scrollHeight,
    body.offsetHeight,
    root.clientHeight,
    root.scrollHeight,
    root.offsetHeight,
  );
}

/**
 * Renders a self-contained explainer document while keeping the top-level page
 * scroll, footer, and theme behavior aligned with the rest of the site.
 */
export function ExplainerFrame({ src, title }: { src: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [theme, setTheme] = useState<ThemeName>("dark");

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

    if (!iframe || !doc) {
      return;
    }

    doc.documentElement.dataset.theme = theme;
    doc.documentElement.style.colorScheme = theme;
    iframe.contentWindow?.dispatchEvent(new CustomEvent("dosewiki-theme-change", { detail: { theme } }));
  }, [theme]);

  const syncFrameHeight = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;

    if (!iframe || !doc) {
      return;
    }

    iframe.style.height = `${getFrameDocumentHeight(doc)}px`;
  }, []);

  const handleFrameLoad = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;

    resizeObserverRef.current?.disconnect();

    if (!iframe || !doc) {
      return;
    }

    doc.documentElement.dataset.theme = theme;
    doc.documentElement.style.colorScheme = theme;
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";
    iframe.contentWindow?.dispatchEvent(new CustomEvent("dosewiki-theme-change", { detail: { theme } }));

    syncFrameHeight();

    resizeObserverRef.current = new ResizeObserver(syncFrameHeight);
    resizeObserverRef.current.observe(doc.documentElement);
    resizeObserverRef.current.observe(doc.body);

    iframe.contentWindow?.removeEventListener("resize", syncFrameHeight);
    iframe.contentWindow?.addEventListener("resize", syncFrameHeight);
  }, [syncFrameHeight, theme]);

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
        scrolling="no"
        style={{
          display: "block",
          width: "100%",
          height: "100dvh",
          border: 0,
          overflow: "hidden",
        }}
      />
    </main>
  );
}
