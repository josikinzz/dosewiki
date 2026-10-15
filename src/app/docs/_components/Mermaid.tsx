"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type MermaidModule = typeof import("mermaid")["default"];

let mermaidPromise: Promise<MermaidModule> | null = null;

async function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => mod.default);
  }

  return mermaidPromise;
}

let renderLock: Promise<unknown> = Promise.resolve();

function queueRender<T>(task: () => Promise<T>): Promise<T> {
  const run = renderLock.then(task, task);
  renderLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function themeConfig(isDark: boolean) {
  return {
    startOnLoad: false,
    theme: "base" as const,
    look: "classic" as const,
    securityLevel: "strict" as const,
    flowchart: {
      htmlLabels: false,
      curve: "basis" as const,
      nodeSpacing: 44,
      rankSpacing: 60,
      padding: 18,
    },
    themeVariables: {
      fontFamily: "var(--font-family-body)",
      fontSize: "15px",
      primaryColor: isDark ? "#15263e" : "#e1eefa",
      primaryBorderColor: isDark ? "#7dd3fc" : "#0c6aa6",
      primaryTextColor: isDark ? "#ece8f6" : "#2b2140",
      secondaryColor: isDark ? "#391a40" : "#f7e6fa",
      secondaryBorderColor: isDark ? "#e879f9" : "#a21caf",
      secondaryTextColor: isDark ? "#ece8f6" : "#2b2140",
      tertiaryColor: isDark ? "#143026" : "#e0f2ea",
      tertiaryBorderColor: isDark ? "#6ee7b7" : "#047857",
      tertiaryTextColor: isDark ? "#ece8f6" : "#2b2140",
      lineColor: isDark ? "#a79ec4" : "#6f6390",
      edgeLabelBackground: isDark ? "#1f1530" : "#f3ecf6",
      clusterBkg: isDark ? "rgba(255,255,255,0.04)" : "rgba(58,30,80,0.03)",
      clusterBorder: isDark ? "rgba(255,255,255,0.18)" : "rgba(58,30,80,0.22)",
    },
  };
}

const LIGHT_PALETTE: Record<string, string> = {
  "#3a1f33": "#fce7f3",
  "#3a2a18": "#ffedd5",
  "#143026": "#e0f2ea",
  "#391a40": "#f7e6fa",
  "#15263e": "#e1eefa",
  "#f9a8d4": "#be185d",
  "#fdba74": "#c2410c",
  "#6ee7b7": "#047857",
  "#e879f9": "#a21caf",
  "#7dd3fc": "#0c6aa6",
  "#f7e3ef": "#2b2140",
  "#f7ead9": "#2b2140",
  "#def3ea": "#2b2140",
  "#f6e2fa": "#2b2140",
  "#ddeefb": "#2b2140",
};

function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme !== "light";
}

const NODE_RADIUS = 10;
const CHIP_PAD_X = 10;
const CHIP_PAD_Y = 4;
const MARKER_SCALE = 1.35;
const DIAGRAM_MAX_WIDTH = "min(100%, 800px)";

function svgStyleSheet(isDark: boolean): string {
  const shadow = isDark
    ? "drop-shadow(0 8px 14px rgba(0, 0, 0, 0.32))"
    : "drop-shadow(0 6px 12px rgba(58, 30, 80, 0.12))";
  const lineColor = isDark ? "#a79ec4" : "#6f6390";
  return [
    `.node .basic{stroke-width:1.25px !important;stroke-opacity:0.78;filter:${shadow};}`,
    ".node .label text{font-family:var(--font-family-body);}",
    ".node .label tspan.text-outer-tspan{fill:var(--theme-text-primary) !important;}",
    ".node .label tspan.title-row{font-weight:600;}",
    ".node .label tspan.desc-row{fill:var(--theme-text-muted) !important;font-size:0.9em;}",
    `.edgePath path.path,.flowchart-link{stroke:${lineColor} !important;stroke-width:1.6px !important;stroke-linecap:round;}`,
    ".edgePath path.edge-pattern-dotted,.flowchart-link.edge-pattern-dotted{stroke-dasharray:8 7 !important;stroke-linecap:butt;}",
    `marker path{fill:${lineColor} !important;stroke:${lineColor} !important;}`,
    ".edgeLabel rect{opacity:1 !important;fill:var(--theme-surface-soft) !important;stroke:var(--theme-border-subtle) !important;stroke-width:1px;}",
    ".edgeLabel text,.edgeLabel tspan{fill:var(--theme-text-muted) !important;font-family:var(--font-family-body);font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;}",
    ".cluster text,.cluster tspan{fill:var(--theme-text-muted) !important;}",
  ].join("");
}

function applySiteStyling(svg: SVGElement, isDark: boolean) {
  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent = svgStyleSheet(isDark);
  svg.appendChild(styleEl);

  svg.querySelectorAll<SVGRectElement>(".node rect.basic").forEach((rect) => {
    rect.setAttribute("rx", String(NODE_RADIUS));
    rect.setAttribute("ry", String(NODE_RADIUS));
  });

  svg.querySelectorAll<SVGTextElement>(".node .label text").forEach((text) => {
    const rows = Array.from(text.querySelectorAll("tspan.text-outer-tspan"));
    rows.forEach((row, index) => {
      row.classList.remove("title-row", "row");
      row.classList.add(index === 0 ? "title-row" : "desc-row");
    });
  });

  svg.querySelectorAll<SVGMarkerElement>("marker").forEach((marker) => {
    const width = Number(marker.getAttribute("markerWidth"));
    const height = Number(marker.getAttribute("markerHeight"));
    if (Number.isFinite(width) && width > 0) {
      marker.setAttribute("markerWidth", (width * MARKER_SCALE).toFixed(2));
    }
    if (Number.isFinite(height) && height > 0) {
      marker.setAttribute("markerHeight", (height * MARKER_SCALE).toFixed(2));
    }
  });

  svg.querySelectorAll<SVGGElement>(".edgeLabel").forEach((label) => {
    const rect = label.querySelector<SVGRectElement>("rect");
    const text = label.querySelector<SVGTextElement>("text");
    if (!rect || !text) {
      return;
    }
    let box: DOMRect;
    try {
      box = text.getBBox();
    } catch {
      return;
    }
    if (!(box.width > 0)) {
      return;
    }
    const width = box.width + CHIP_PAD_X * 2;
    const height = box.height + CHIP_PAD_Y * 2;
    rect.setAttribute("x", (box.x - CHIP_PAD_X).toFixed(2));
    rect.setAttribute("y", (box.y - CHIP_PAD_Y).toFixed(2));
    rect.setAttribute("width", width.toFixed(2));
    rect.setAttribute("height", height.toFixed(2));
    rect.setAttribute("rx", (height / 2).toFixed(2));
    rect.setAttribute("ry", (height / 2).toFixed(2));
  });
}

let renderSeq = 0;

export function Mermaid({ chart, title }: { chart: string; title?: string }) {
  const figureRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setActivated(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActivated(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!activated) {
      return;
    }
    let cancelled = false;
    let latestRender = 0;

    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const revision = ++latestRender;
      const isDark = isDarkTheme();
      const isCurrent = () =>
        !cancelled &&
        revision === latestRender &&
        canvasRef.current === canvas &&
        isDark === isDarkTheme();

      try {
        const mermaid = await loadMermaid();
        if (!isCurrent()) {
          return;
        }

        const id = `docs-mermaid-${(renderSeq += 1)}`;
        const source = isDark
          ? chart.trim()
          : chart
              .trim()
              .replace(/#[0-9a-fA-F]{6}\b/g, (hex) => LIGHT_PALETTE[hex.toLowerCase()] ?? hex);
        const svg = await queueRender(async () => {
          if (!isCurrent()) {
            return null;
          }
          mermaid.initialize(themeConfig(isDark));
          const out = await mermaid.render(id, source);
          return out.svg;
        });
        if (svg === null || !isCurrent()) {
          return;
        }

        canvas.innerHTML = svg;
        const svgEl = canvas.querySelector("svg");
        if (svgEl) {
          svgEl.removeAttribute("height");
          svgEl.style.maxWidth = DIAGRAM_MAX_WIDTH;
          svgEl.style.height = "auto";
          applySiteStyling(svgEl, isDark);
        }
        setError(null);
        setReady(true);
      } catch (renderError) {
        if (isCurrent()) {
          setError(renderError instanceof Error ? renderError.message : "Diagram failed to render");
        }
      }
    };

    void render();

    const observer = new MutationObserver(() => {
      void render();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [activated, chart]);

  return (
    <figure ref={figureRef} className="my-6">
      <div className="theme-card-surface flex min-h-[300px] items-center justify-center overflow-auto rounded-2xl border p-6">
        <div className="relative w-full">
          <div
            ref={canvasRef}
            className="mermaid mx-auto flex justify-center"
            role="img"
            aria-label={title ?? "Diagram"}
            data-ready={ready}
          />
        </div>
        {error ? (
          <pre className="theme-card-surface theme-text-secondary m-0 max-h-[480px] overflow-auto whitespace-pre-wrap break-words rounded-xl border p-4 font-mono text-sm">
            {`Diagram failed to render: ${error}\n\n${chart.trim()}`}
          </pre>
        ) : null}
      </div>
      {title ? (
        <figcaption className="theme-text-muted mt-2.5 text-[0.8125rem] leading-5">
          {title}
        </figcaption>
      ) : null}
    </figure>
  );
}
