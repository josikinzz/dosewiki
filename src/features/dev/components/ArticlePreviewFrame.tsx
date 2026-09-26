"use client";

/**
 * A draft inside the real substance article, before it publishes.
 *
 * The frame renders the public `ArticleLayout` itself (beta disclaimer, review
 * chip, safety banners, hero with molecule, the Subjective Effects showcase and
 * every other section) with the editor's draft injected through the same props
 * the substance route passes. Nothing here re-draws the page.
 *
 * Why an iframe. Every colour token keys on `html[data-theme]`, and the
 * appearance runtime writes its sheets and variables against the root element,
 * so a wrapper `div` cannot be themed on its own without flipping the whole
 * editor. Phone width also has to reach the page's media queries, which read
 * the viewport, not a container. A same-origin `about:blank` iframe gives both:
 * its own root carries the preview theme and its own viewport is the chosen
 * width. React still owns the tree through a portal, so context (translation,
 * router, session) and draft props flow in directly, with no preview route and
 * no message passing. The editor's stylesheets are mirrored into the frame and
 * kept in step as the editor loads more.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";

import { ArticleLayout, type ArticleLayoutProps } from "@/features/article/components/ArticleLayout";
import { SubstanceWarningBanners } from "@/features/article/components/sections/SubstanceWarningBanners";
import { moleculeOverrideImageUrl } from "@/data/mappings/moleculeOverrideUrl";
import { Button } from "@/components/ui/button";
import {
  MAX_BANNERS_PER_ARTICLE,
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  type WarningBannerPreset,
} from "@/data/substanceWarningBanners";
import { useEditorRead } from "@/hooks/useEditorRead";
import { substanceHasCitationNeeded } from "@/lib/citations/citationTokens";
import type { SubstanceArticle } from "@/schema";
import type { ColorScheme } from "@/theme";
import { draftMoleculeImageUrl, previewBannerStack } from "./articlePreviewModel";
import { EditorSegmentedControl } from "./EditorNavigation";
import { Notice, type NoticeMessage } from "./Notice";
import { EditorToolbar } from "./EditorToolbar";
import { SearchablePicker } from "./SearchablePicker";

export type ArticlePreviewWidth = "phone" | "desktop";

/** Viewport widths the frame lays the article out at. */
export const ARTICLE_PREVIEW_WIDTHS: Record<ArticlePreviewWidth, number> = {
  phone: 390,
  desktop: 1280,
};

const FRAME_HEIGHT = 760;
/** The smallest frame while there is no article to draw (none picked, or it failed). */
const FALLBACK_MIN_HEIGHT = 120;

export type ArticlePreviewSlugOption = { slug: string; title: string };

/** The unsaved pieces a tool can place in the article. */
export type ArticlePreviewDraft = {
  /**
   * A draft banner preset. It takes its saved copy's place among `presets`
   * (every stored preset), and the route's own rule orders and caps the stack.
   */
  banner?: { preset: WarningBannerPreset; presets: readonly WarningBannerPreset[] };
  /** The Replication Showcase as it will render once saved. */
  showcase?: ReactNode;
  /** An unsaved depiction as SVG markup, recoloured per the frame's theme. */
  moleculeSvg?: string | null;
};

export type ArticlePreviewFrameProps = {
  slug: string | null;
  /** Offered in the picker by title. Omit to fix the frame on `slug`. */
  slugOptions?: readonly ArticlePreviewSlugOption[];
  onSlugChange?: (slug: string) => void;
  draft?: ArticlePreviewDraft;
  /** Any other layout prop, passed through as the route would pass it. */
  overrides?: Partial<Omit<ArticleLayoutProps, "article">>;
  /** Names the frame for assistive tech and tests. */
  label?: string;
  /** The width the frame opens at; the editor can still switch. Defaults to desktop. */
  defaultWidth?: ArticlePreviewWidth;
};

/* ------------------------------------------------------------------ */
/* Article loading                                                     */
/* ------------------------------------------------------------------ */

type ArticleLoad =
  | { status: "idle" | "loading" | "failed"; article: null }
  | { status: "ready"; article: SubstanceArticle };

/** Whole articles already fetched this session, shared across frames. */
const articleCache = new Map<string, SubstanceArticle>();

/** Test seam: forget every cached article. */
export function clearArticlePreviewCache() {
  articleCache.clear();
}

function usePreviewArticle(slug: string | null): ArticleLoad & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<ArticleLoad>(() => {
    const cached = slug ? articleCache.get(slug) : undefined;
    return cached ? { status: "ready", article: cached } : { status: "idle", article: null };
  });

  useEffect(() => {
    if (!slug) {
      setLoad({ status: "idle", article: null });
      return;
    }
    const cached = articleCache.get(slug);
    if (cached) {
      setLoad({ status: "ready", article: cached });
      return;
    }
    let active = true;
    setLoad({ status: "loading", article: null });
    // The same per-slug read the review workbench hydrates from.
    Promise.resolve()
      .then(() => fetch(`/api/dev/editor-library?slug=${encodeURIComponent(slug)}`))
      .then((response) =>
        response.ok ? (response.json() as Promise<{ article?: SubstanceArticle }>) : null,
      )
      .then((payload) => {
        if (!active) return;
        if (payload?.article) {
          articleCache.set(slug, payload.article);
          setLoad({ status: "ready", article: payload.article });
        } else {
          setLoad({ status: "failed", article: null });
        }
      })
      .catch(() => {
        if (active) setLoad({ status: "failed", article: null });
      });
    return () => {
      active = false;
    };
  }, [slug, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...load, retry };
}

/* ------------------------------------------------------------------ */
/* Frame document                                                      */
/* ------------------------------------------------------------------ */

/** Per frame document: each editor style node and the copy mirrored from it. */
const mirroredStyles = new WeakMap<Document, Map<Element, HTMLElement>>();

/**
 * Keeps the frame document styled like the editor: the same stylesheets and
 * the same root attributes (visual style, accent, surface, fonts), with only
 * the colour scheme replaced by the frame's own. Style nodes are mirrored
 * incrementally, so a title or meta change in the editor never reloads the
 * frame's sheets.
 */
function syncFrameDocument(frame: Document, scheme: ColorScheme) {
  const host = document;
  const mirrors = mirroredStyles.get(frame) ?? new Map<Element, HTMLElement>();
  mirroredStyles.set(frame, mirrors);

  const current = new Set(host.head.querySelectorAll('link[rel="stylesheet"], style'));
  for (const [source, copy] of mirrors) {
    if (!current.has(source)) {
      copy.remove();
      mirrors.delete(source);
    }
  }
  for (const source of current) {
    const existing = mirrors.get(source);
    if (existing) {
      // Dev reloads rewrite a style node's text in place.
      if (source instanceof HTMLStyleElement && existing.textContent !== source.textContent) {
        existing.textContent = source.textContent;
      }
      continue;
    }
    const copy = source.cloneNode(true) as HTMLElement;
    if (source instanceof HTMLLinkElement && source.href) {
      copy.setAttribute("href", source.href);
    }
    frame.head.appendChild(copy);
    mirrors.set(source, copy);
  }

  const root = frame.documentElement;
  for (const attribute of Array.from(root.attributes)) {
    root.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(host.documentElement.attributes)) {
    root.setAttribute(attribute.name, attribute.value);
  }
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;

  frame.body.className = host.body.className;
  frame.body.style.margin = "0";
}

function useFrameBody(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  scheme: ColorScheme,
): HTMLElement | null {
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);

  // An iframe without `src` keeps its initial about:blank document; the load
  // listener covers engines that swap it once.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const adopt = () => {
      const next = iframe.contentDocument;
      if (next?.body) setFrameDocument((current) => (current === next ? current : next));
    };
    adopt();
    iframe.addEventListener("load", adopt);
    return () => iframe.removeEventListener("load", adopt);
  }, [iframeRef]);

  useLayoutEffect(() => {
    if (!frameDocument) return;
    syncFrameDocument(frameDocument, scheme);
    if (typeof MutationObserver === "undefined") return;
    // Dev and lazily loaded routes add sheets after mount, and the editor's
    // appearance controls rewrite root attributes; follow both.
    const observer = new MutationObserver(() => syncFrameDocument(frameDocument, scheme));
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [frameDocument, scheme]);

  return frameDocument?.body ?? null;
}

/** Scales the desktop layout down to the space the editor gives it. */
function useFitScale(viewportRef: React.RefObject<HTMLDivElement | null>, width: number): number {
  const [available, setAvailable] = useState<number | null>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewportRef]);
  return available && available < width ? available / width : 1;
}

/** Links and forms are live components; inside a preview they go nowhere. */
function blockNavigation(event: MouseEvent | SyntheticEvent) {
  const target = event.target as Element | null;
  if (event.type === "submit" || target?.closest?.("a[href]")) {
    event.preventDefault();
  }
}

function hostScheme(): ColorScheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

export function ArticlePreviewFrame({
  slug,
  slugOptions,
  onSlugChange,
  draft,
  overrides,
  label = "Article preview",
  defaultWidth = "desktop",
}: ArticlePreviewFrameProps) {
  const [scheme, setScheme] = useState<ColorScheme>(hostScheme);
  const [width, setWidth] = useState<ArticlePreviewWidth>(defaultWidth);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const body = useFrameBody(iframeRef, scheme);
  const frameWidth = ARTICLE_PREVIEW_WIDTHS[width];
  const scale = useFitScale(viewportRef, frameWidth);
  const load = usePreviewArticle(slug);
  const article = load.article;
  // Without an article the frame holds only the banner stack (or nothing), so
  // it shrinks to what it shows instead of keeping an article's height. The
  // stack is measured inside the frame's own window, where it lays out.
  const fallbackRef = useRef<HTMLElement>(null);
  const [fallbackHeight, setFallbackHeight] = useState<number | null>(null);
  const compact = !article && load.status !== "loading";
  useLayoutEffect(() => {
    const node = fallbackRef.current;
    if (!compact || !node) {
      setFallbackHeight(null);
      return;
    }
    const measure = () => setFallbackHeight(Math.ceil(node.getBoundingClientRect().height));
    measure();
    const FrameResizeObserver = node.ownerDocument.defaultView?.ResizeObserver;
    if (!FrameResizeObserver) return;
    const observer = new FrameResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [compact, body]);
  const frameHeight = compact ? Math.min(FRAME_HEIGHT, Math.max(FALLBACK_MIN_HEIGHT, fallbackHeight ?? FALLBACK_MIN_HEIGHT)) : FRAME_HEIGHT;

  // The saved depiction, versioned the way the substance route versions it.
  const moleculeMeta = useEditorRead(
    "moleculeOverrides:getMetadataBySlug",
    slug && !draft?.moleculeSvg ? { slug } : "skip",
    "document",
  );

  // Serializes the whole article, so once per article, not per keystroke.
  const showBetaDisclaimer = useMemo(
    () => (article ? substanceHasCitationNeeded(article) : false),
    [article],
  );
  const bannerStack = useMemo(
    () =>
      draft?.banner && slug
        ? previewBannerStack({
            presets: draft.banner.presets,
            draft: draft.banner.preset,
            slug,
            showBetaDisclaimer,
          })
        : null,
    [draft?.banner, slug, showBetaDisclaimer],
  );

  const moleculeOverrideUrl = draft?.moleculeSvg
    ? draftMoleculeImageUrl(draft.moleculeSvg, scheme)
    : slug && moleculeMeta
      ? moleculeOverrideImageUrl(slug, moleculeMeta.updatedAt)
      : null;

  const iconSize = overrides?.warningBannerIconSize ?? SAFETY_BANNER_ICON_SIZE_DEFAULT;
  const warningBanners = bannerStack?.banners ?? overrides?.warningBanners;
  const title =
    slugOptions?.find((option) => option.slug === slug)?.title ??
    article?.title ??
    slug ??
    "";

  // Tools that preview something below the fold (the showcase) mark it; the
  // frame opens there once the article has laid out.
  useEffect(() => {
    if (!body || !article) return;
    const focus = body.querySelector<HTMLElement>("[data-preview-focus]");
    focus?.scrollIntoView?.({ block: "start" });
  }, [body, article, width]);

  const notices: NoticeMessage[] = [];
  if (bannerStack?.forced) {
    notices.push({
      tone: "neutral",
      message: `Shown as if enabled on ${title}. Readers of this article do not see this banner yet.`,
    });
  }
  if (bannerStack?.hiddenBy === "cap") {
    notices.push({
      tone: "warning",
      message: `${title} already shows ${MAX_BANNERS_PER_ARTICLE} higher-ranked banners, the limit per article, so readers would not see this one.`,
    });
  } else if (bannerStack?.hiddenBy === "audited") {
    notices.push({
      tone: "neutral",
      message: `${title} has had its citation audit, so the beta notice replaces citation-overhaul banners here.`,
    });
  }
  if (load.status === "failed") {
    notices.push({
      tone: "warning",
      message: `The ${title} article could not be loaded, so the frame shows the banner stack only.`,
      actions: (
        <Button type="button" variant="outline" size="sm" onClick={load.retry}>
          Try again
        </Button>
      ),
    });
  }

  const content = article ? (
    <main className="theme-page-shell min-h-screen">
      <ArticleLayout
        article={article}
        showBetaDisclaimer={showBetaDisclaimer}
        moleculeOverrideUrl={moleculeOverrideUrl}
        {...overrides}
        warningBanners={warningBanners}
        warningBannerIconSize={iconSize}
        replicationShowcaseSection={
          draft?.showcase !== undefined ? (
            <div data-preview-focus="">{draft.showcase}</div>
          ) : (
            overrides?.replicationShowcaseSection
          )
        }
      />
    </main>
  ) : (
    <main ref={fallbackRef} className={`theme-page-shell space-y-4 p-6${compact ? "" : " min-h-screen"}`}>
      {load.status === "loading" ? (
        <p className="theme-text-faint text-sm">{`Loading ${title}…`}</p>
      ) : null}
      <SubstanceWarningBanners banners={warningBanners ?? []} iconSize={iconSize} />
    </main>
  );

  return (
    <div className="space-y-3">
      <EditorToolbar label="Preview controls">
        {slugOptions && slugOptions.length > 0 ? (
          <div className="w-full max-w-xs">
            <SearchablePicker
              ariaLabel="Preview article"
              options={slugOptions.map((option) => ({
                value: option.slug,
                label: option.title,
                hint: option.slug,
              }))}
              value={slug}
              onChange={(next) => {
                if (next) onSlugChange?.(next);
              }}
              placeholder="Find a substance"
              emptyText="No substance matches."
            />
          </div>
        ) : null}
        <EditorSegmentedControl
          label="Preview theme"
          value={scheme}
          onChange={(next) => setScheme(next === "light" ? "light" : "dark")}
          options={[
            { value: "light", label: "Light", icon: "lucide:sun" },
            { value: "dark", label: "Dark", icon: "lucide:moon" },
          ]}
        />
        <EditorSegmentedControl
          label="Preview width"
          value={width}
          onChange={(next) => setWidth(next === "phone" ? "phone" : "desktop")}
          options={[
            { value: "phone", label: "Phone", icon: "lucide:smartphone" },
            { value: "desktop", label: "Desktop", icon: "lucide:monitor" },
          ]}
        />
      </EditorToolbar>

      {notices.map((notice, index) => (
        <Notice key={index} {...notice} />
      ))}

      <div
        ref={viewportRef}
        className="overflow-hidden rounded-xl border border-dose-border"
        style={{ height: frameHeight * scale }}
      >
        <iframe
          ref={iframeRef}
          title={`${label}: ${title}`}
          data-preview-theme={scheme}
          data-preview-width={width}
          className="block border-0"
          style={{
            width: frameWidth,
            height: frameHeight,
            margin: width === "phone" ? "0 auto" : undefined,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: "0 0",
          }}
        />
        {body
          ? createPortal(
              <div onClickCapture={blockNavigation} onSubmitCapture={blockNavigation}>
                {content}
              </div>,
              body,
            )
          : null}
      </div>
    </div>
  );
}
