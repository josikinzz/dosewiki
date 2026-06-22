import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildThemeRuleIndex, resolveTokensAt } from "./pickToken";

function installStyle(css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

describe("Palette Lab pick token resolver", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.setAttribute("data-theme", "dark");
  });

  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
  });

  it("prefers the visible header background over the backdrop-safe fallback", () => {
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

    expect(candidates.find((candidate) => candidate.role === "fill")?.id).toBe(
      "--theme-panel-base",
    );
  });

  it("maps chrome rail gradients to the editable top bar color", () => {
    installStyle(`
      .theme-header-surface {
        background: var(--theme-chrome-rail-bg) !important;
      }
    `);
    const header = document.createElement("header");
    header.className = "theme-header-surface";
    document.body.appendChild(header);

    const candidates = resolveTokensAt(header, buildThemeRuleIndex("dark"));

    expect(candidates.find((candidate) => candidate.role === "fill")?.id).toBe(
      "--theme-chrome-rail-base",
    );
  });

  it("redirects dosage duration panel backgrounds to the editable neutral panel base", () => {
    installStyle(`
      .theme-dose-duration-panel {
        background: var(--theme-article-neutral-panel-bg);
      }
    `);
    const panel = document.createElement("div");
    panel.className = "theme-dose-duration-panel";
    document.body.appendChild(panel);

    const candidates = resolveTokensAt(panel, buildThemeRuleIndex("dark"));

    expect(candidates.find((candidate) => candidate.role === "fill")?.id).toBe(
      "--theme-article-neutral-panel-base",
    );
  });
});
