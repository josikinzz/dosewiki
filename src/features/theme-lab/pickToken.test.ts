import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildThemeRuleIndex, resolveTokensAt } from "./pickToken";

function installStyle(css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

describe("Theme Lab pick token resolver", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.setAttribute("data-theme", "dark");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
  });

  it("prefers visible panel gradient stops over the backdrop-safe fallback", () => {
    installStyle(`
      .theme-header-surface {
        background: var(--theme-frosted-panel-bg);
      }

      .backdrop-safe {
        background-color: var(--theme-backdrop-safe);
      }
    `);
    const header = document.createElement("header");
    header.className = "theme-header-surface backdrop-safe";
    document.body.appendChild(header);

    const candidates = resolveTokensAt(header, buildThemeRuleIndex("dark"));

    expect(candidates.filter((candidate) => candidate.role === "fill").map((candidate) => candidate.id)).toEqual([
      "--theme-frosted-panel-highlight",
      "--theme-frosted-panel-primary",
      "--theme-frosted-panel-secondary",
    ]);
  });

  it("maps chrome rail gradients to editable top bar stops", () => {
    installStyle(`
      .theme-header-surface {
        background: var(--theme-chrome-rail-bg) !important;
      }
    `);
    const header = document.createElement("header");
    header.className = "theme-header-surface";
    document.body.appendChild(header);

    const candidates = resolveTokensAt(header, buildThemeRuleIndex("dark"));

    expect(candidates.filter((candidate) => candidate.role === "fill").map((candidate) => candidate.id)).toEqual([
      "--theme-chrome-rail-highlight",
      "--theme-chrome-rail-primary",
      "--theme-chrome-rail-secondary",
    ]);
  });

  it("expands dosage duration panel backgrounds to editable neutral panel stops", () => {
    installStyle(`
      .theme-dose-duration-panel {
        background: var(--theme-article-neutral-panel-bg);
      }
    `);
    const panel = document.createElement("div");
    panel.className = "theme-dose-duration-panel";
    document.body.appendChild(panel);

    const candidates = resolveTokensAt(panel, buildThemeRuleIndex("dark"));

    expect(candidates.filter((candidate) => candidate.role === "fill").map((candidate) => candidate.id)).toEqual([
      "--theme-article-neutral-panel-highlight",
      "--theme-article-neutral-panel-primary",
      "--theme-article-neutral-panel-secondary",
    ]);
  });

  it("indexes themed rules even when CSSStyleRule instanceof checks are unreliable", () => {
    installStyle(`
      .theme-public-card {
        background: var(--theme-frosted-panel-bg);
        border-color: var(--theme-frosted-panel-border);
      }
    `);
    const card = document.createElement("div");
    card.className = "theme-public-card";
    document.body.appendChild(card);
    vi.stubGlobal("CSSStyleRule", class NotTheBrowserStyleRule {});

    const candidates = resolveTokensAt(card, buildThemeRuleIndex("dark"));

    expect(candidates.filter((candidate) => candidate.role === "fill").map((candidate) => candidate.id)).toEqual([
      "--theme-frosted-panel-highlight",
      "--theme-frosted-panel-primary",
      "--theme-frosted-panel-secondary",
    ]);
    expect(candidates.find((candidate) => candidate.role === "border")?.id).toBe(
      "--theme-frosted-panel-border",
    );
  });

  it("falls back to currently matching themed CSS rules when the prebuilt index missed", () => {
    installStyle(`
      .theme-reference-label {
        color: color-mix(in srgb, var(--theme-text-primary) 72%, var(--theme-body-bg));
      }
    `);
    const label = document.createElement("span");
    label.className = "theme-reference-label";
    document.body.appendChild(label);

    const candidates = resolveTokensAt(label, []);

    expect(candidates.find((candidate) => candidate.role === "text")?.id).toBe(
      "--theme-text-primary",
    );
  });

  it("prefers the explicitly weighted color-mix token over the unweighted fallback", () => {
    installStyle(`
      .mixed-text {
        color: color-mix(in srgb, var(--theme-text-primary) 72%, var(--theme-body-bg));
      }
    `);
    const label = document.createElement("span");
    label.className = "mixed-text";
    document.body.appendChild(label);

    const candidates = resolveTokensAt(label, buildThemeRuleIndex("dark"));

    expect(candidates.find((candidate) => candidate.role === "text")?.id).toBe(
      "--theme-text-primary",
    );
  });

  it("reads theme tokens from Tailwind arbitrary class values when CSS rule matching misses", () => {
    const link = document.createElement("span");
    link.className = "text-[color:var(--theme-accent-strong)]";
    link.style.color = "rgb(240, 171, 252)";
    document.body.appendChild(link);

    const candidates = resolveTokensAt(link, []);

    expect(candidates.find((candidate) => candidate.role === "text")?.id).toBe(
      "--theme-accent-strong",
    );
  });

  it("expands the dose.wiki logo fill into editable logo stops", () => {
    installStyle(`
      .theme-dosewiki-logo {
        background: var(--theme-logo-fill);
      }
    `);
    const logo = document.createElement("span");
    logo.className = "theme-dosewiki-logo";
    document.body.appendChild(logo);

    const candidates = resolveTokensAt(logo, buildThemeRuleIndex("dark"));

    expect(candidates.filter((candidate) => candidate.role === "fill").map((candidate) => candidate.id)).toEqual([
      "--site-logo-stop-1",
      "--site-logo-stop-2",
      "--site-logo-stop-3",
      "--site-logo-stop-4",
    ]);
  });

  it("recognizes the shared logo class when CSSOM exposes only the computed gradient", () => {
    const logo = document.createElement("span");
    logo.className = "theme-dosewiki-logo";
    logo.style.background = "linear-gradient(118deg, rgb(1 2 3), rgb(4 5 6))";
    document.body.appendChild(logo);

    const candidates = resolveTokensAt(logo, []);

    expect(candidates.filter((candidate) => candidate.role === "fill").map((candidate) => candidate.id)).toEqual([
      "--site-logo-stop-1",
      "--site-logo-stop-2",
      "--site-logo-stop-3",
      "--site-logo-stop-4",
    ]);
  });

  it("expands interaction card backgrounds into primary and secondary gradient stops", () => {
    installStyle(`
      .theme-interaction-danger {
        background: var(--theme-semantic-danger-card-bg);
      }
    `);
    const card = document.createElement("section");
    card.className = "theme-interaction-danger";
    document.body.appendChild(card);

    const candidates = resolveTokensAt(card, buildThemeRuleIndex("dark"));

    expect(candidates.filter((candidate) => candidate.role === "fill").map((candidate) => candidate.id)).toEqual([
      "--theme-interaction-danger-card-primary",
      "--theme-interaction-danger-card-secondary",
    ]);
  });

  it("reads primitive channel seeds from authored CSS variables", () => {
    installStyle(`
      .brand-seed-text {
        color: rgb(var(--c-brand));
      }
    `);
    const label = document.createElement("span");
    label.className = "brand-seed-text";
    document.body.appendChild(label);

    const candidates = resolveTokensAt(label, buildThemeRuleIndex("dark"));

    expect(candidates.find((candidate) => candidate.role === "text")?.id).toBe("--c-brand");
  });

  it("ignores authored text tokens when computed text paint is transparent", () => {
    installStyle(`
      .tokenized-text {
        color: var(--theme-text-primary);
      }
    `);
    const label = document.createElement("span");
    label.className = "tokenized-text";
    label.style.color = "transparent";
    document.body.appendChild(label);

    const candidates = resolveTokensAt(label, buildThemeRuleIndex("dark"));

    expect(candidates.some((candidate) => candidate.role === "text")).toBe(false);
  });

  it("ignores authored background tokens when computed paint is transparent", () => {
    installStyle(`
      .tokenized-but-clear {
        background: var(--theme-frosted-control-bg);
      }
    `);
    const chip = document.createElement("button");
    chip.className = "tokenized-but-clear";
    chip.style.background = "transparent";
    document.body.appendChild(chip);

    const candidates = resolveTokensAt(chip, buildThemeRuleIndex("dark"));

    expect(candidates.some((candidate) => candidate.role === "fill")).toBe(false);
  });

  it("does not offer border tokens when the computed border is hidden", () => {
    installStyle(`
      .tokenized-border {
        border: 1px solid var(--theme-border-strong);
      }
    `);
    const box = document.createElement("div");
    box.className = "tokenized-border";
    box.style.borderStyle = "none";
    document.body.appendChild(box);

    const candidates = resolveTokensAt(box, buildThemeRuleIndex("dark"));

    expect(candidates.some((candidate) => candidate.role === "border")).toBe(false);
  });
});
