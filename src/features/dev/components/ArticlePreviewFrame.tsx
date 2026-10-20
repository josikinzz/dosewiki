"use client";

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

export const ARTICLE_PREVIEW_WIDTHS: Record<ArticlePreviewWidth, number> = {
  phone: 390,
  desktop: 1280,
};

const FRAME_HEIGHT = 760;
const FALLBACK_MIN_HEIGHT = 120;

export type ArticlePreviewSlugOption = { slug: string; title: string };

export type ArticlePreviewDraft = {
  banner?: { preset: WarningBannerPreset; presets: readonly WarningBannerPreset[] };
  showcase?: ReactNode;
  moleculeSvg?: string | null;
};

export type ArticlePreviewFrameProps = {
  slug: string | null;
  slugOptions?: readonly ArticlePreviewSlugOption[];
  onSlugChange?: (slug: string) => void;
  draft?: ArticlePreviewDraft;
  overrides?: Partial<Omit<ArticleLayoutProps, "article">>;
  label?: string;
  defaultWidth?: ArticlePreviewWidth;
};

type ArticleLoad =
  | { status: "idle" | "loading" | "failed"; article: null }
  | { status: "ready"; article: SubstanceArticle };

function usePreviewArticle(slug: string | null): ArticleLoad & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<ArticleLoad>({ status: "idle", article: null });

  useEffect(() => {
    if (!slug) {
      setLoad({ status: "idle", article: null });
      return;
    }
    let active = true;
    setLoad({ status: "loading", article: null });
    Promise.resolve()
      .then(() => fetch(`/api/dev/editor-library?slug=${encodeURIComponent(slug)}`, { cache: "no-store" }))
      .then((response) =>
        response.ok ? (response.json() as Promise<{ article?: SubstanceArticle }>) : null,
      )
      .then((payload) => {
        if (!active) return;
        if (payload?.article) {
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

const mirroredStyles = new WeakMap<Document, Map<Element, HTMLElement>>();

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
    const observer = new MutationObserver(() => syncFrameDocument(frameDocument, scheme));
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [frameDocument, scheme]);

  return frameDocument?.body ?? null;
}

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

  const moleculeMeta = useEditorRead(
    "moleculeOverrides:getMetadataBySlug",
    slug && !draft?.moleculeSvg ? { slug } : "skip",
    "document",
  );

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
        <p className="theme-text-faint text-sm">{`Loading ${title}`}</p>
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
