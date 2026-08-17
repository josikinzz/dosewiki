"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a Mermaid diagram natively (no iframe). The diagram source is passed
 * as a string and rendered client-side; mermaid + the ELK layout engine are
 * lazy-loaded so they only ship in the /docs route chunk.
 *
 * Theming mirrors the original self-contained explainer docs: the `base` theme
 * with hand-tuned light/dark `themeVariables`, plus a post-render pass that
 * forces every label to one high-contrast colour (mermaid's own class/attribute
 * colouring is inconsistent across node fills), plus a light-mode remap of the
 * shared classDef palette (see LIGHT_PALETTE below).
 *
 * Promotion note: this is currently docs-local. If a second surface needs
 * diagrams, promote it to the shared kit (src/components/ui) and register a
 * /dev/kit story.
 */

type MermaidModule = typeof import("mermaid")["default"];

let mermaidPromise: Promise<MermaidModule> | null = null;

async function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    // Use mermaid's built-in dagre layout (default) — NOT the ELK layout plugin.
    // ELK runs layout in a Web Worker and serializes mermaid's graph, which
    // contains circular references; under the app's bundler that throws
    // "cyclic object value" in the browser and the diagram never renders.
    mermaidPromise = import("mermaid").then((mod) => mod.default);
  }

  return mermaidPromise;
}

// Mermaid is a singleton with mutable global config; running two renders (or an
// initialize during a render) concurrently corrupts its internal state. React
// StrictMode double-invokes effects in dev and a page may hold several diagrams,
// so serialize every initialize+render through one chain.
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
    flowchart: { htmlLabels: false, nodeSpacing: 64, rankSpacing: 84, padding: 28 },
    themeVariables: {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontSize: "17px",
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
      clusterBkg: isDark ? "rgba(255,255,255,0.04)" : "rgba(58,30,80,0.03)",
      clusterBorder: isDark ? "rgba(255,255,255,0.18)" : "rgba(58,30,80,0.22)",
    },
  };
}

// Every docs diagram hard-codes one shared five-tone dark palette in its
// classDef lines (Mermaid class styling ignores themeVariables, so the charts
// carry raw hexes). Those fills are unreadable on the light theme, so in light
// mode each dark hex is remapped to a hand-tuned same-hue light counterpart
// before render. The chart strings in the pages stay verbatim; only the text
// handed to mermaid.render changes. Strokes double as the legend swatch hues
// (see STAGE_TONE in docs/how) — light strokes keep the hue, darkened for
// contrast on the light surface.
const LIGHT_PALETTE: Record<string, string> = {
  // node fills (dark → light tint)
  "#3a1f33": "#fce7f3",
  "#3a2a18": "#ffedd5",
  "#143026": "#e0f2ea",
  "#391a40": "#f7e6fa",
  "#15263e": "#e1eefa",
  // node strokes (pastel → darkened same hue)
  "#f9a8d4": "#be185d",
  "#fdba74": "#c2410c",
  "#6ee7b7": "#047857",
  "#e879f9": "#a21caf",
  "#7dd3fc": "#0c6aa6",
  // classDef label colours (light → the shared light-theme text colour)
  "#f7e3ef": "#2b2140",
  "#f7ead9": "#2b2140",
  "#def3ea": "#2b2140",
  "#f6e2fa": "#2b2140",
  "#ddeefb": "#2b2140",
};

function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme !== "light";
}

/** Force every diagram label to one high-contrast colour for the active theme. */
function enforceLabelContrast(svg: SVGElement, isDark: boolean) {
  const textColor = isDark ? "#ece8f6" : "#2b2140";
  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent =
    ".nodeLabel,.nodeLabel *,.label,.label *,.edgeLabel,.edgeLabel *," +
    ".node text,.node tspan,.cluster text,.cluster tspan,text,tspan" +
    "{fill:" + textColor + " !important;color:" + textColor + " !important;}";
  svg.appendChild(styleEl);
  svg.querySelectorAll("text, tspan, .nodeLabel, .label, .edgeLabel").forEach((el) => {
    el.setAttribute("fill", textColor);
    if (el instanceof SVGElement) {
      el.style.setProperty("fill", textColor, "important");
      el.style.setProperty("color", textColor, "important");
    }
  });
}

let renderSeq = 0;

export function Mermaid({ chart, title }: { chart: string; title?: string }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      try {
        const mermaid = await loadMermaid();
        if (cancelled) {
          return;
        }

        const isDark = isDarkTheme();
        const id = `docs-mermaid-${(renderSeq += 1)}`;
        const source = isDark
          ? chart.trim()
          : chart
              .trim()
              .replace(/#[0-9a-fA-F]{6}\b/g, (hex) => LIGHT_PALETTE[hex.toLowerCase()] ?? hex);
        const svg = await queueRender(async () => {
          mermaid.initialize(themeConfig(isDark));
          const out = await mermaid.render(id, source);
          return out.svg;
        });
        if (cancelled || !canvasRef.current) {
          return;
        }

        canvasRef.current.innerHTML = svg;
        const svgEl = canvasRef.current.querySelector("svg");
        if (svgEl) {
          svgEl.removeAttribute("height");
          svgEl.style.maxWidth = "100%";
          enforceLabelContrast(svgEl, isDark);
        }
        setError(null);
        setReady(true);
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Diagram failed to render");
        }
      }
    };

    void render();

    // Re-render when the site theme flips so diagram colours track light/dark.
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
  }, [chart]);

  return (
    <div className="my-6">
      {title ? (
        <div className="theme-text-faint mb-2 font-mono text-xs">{title}</div>
      ) : null}
      <div className="theme-card-surface flex min-h-[300px] items-center justify-center overflow-auto rounded-2xl border p-6">
        <div className="relative w-full">
          <div
            ref={canvasRef}
            className="mermaid flex justify-center"
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
    </div>
  );
}
