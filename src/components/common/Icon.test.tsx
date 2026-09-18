/**
 * The contract under test: icon names that appear as literals in the repo are
 * bundled offline (`iconData.generated.json`) and render synchronously — in
 * server output and on first client paint — without ever touching the Iconify
 * API. Only names outside the bundle keep the runtime-fetch path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Icon } from "./Icon";
import { IconSpriteScope } from "./IconSprite";

// The suite-wide setup stubs @iconify/react to a null renderer because the old
// Icon always reached for the network. This file tests the real wrapper: the
// offline bundle makes it deterministic, and no test here renders an unbundled
// name on the client, so nothing can start a runtime load.
vi.unmock("@iconify/react");

// Tripwire: any icon that resolves offline must never touch the network.
const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

describe("Icon offline bundle", () => {
  it("renders a bundled icon synchronously with zero network", () => {
    const { container } = render(<Icon icon="lucide:menu" size={24} />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // Real glyph geometry, not an empty shell.
    expect(svg!.innerHTML).toContain("<path");
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders bundled icons in server output (SSR, before any JS runs)", () => {
    const html = renderToStaticMarkup(<Icon icon="lucide:menu" size={24} />);

    expect(html).toContain("<svg");
    expect(html).toContain("<path");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps custom: icons on the local registry", () => {
    const { container } = render(<Icon icon="custom:benzene" size={24} />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("polygon")).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders a placeholder for unbundled names (SSR, where no loader can start)", () => {
    // Server output for a name outside the bundle: an empty span, not an svg.
    // The client then hydrates the same span and fetches from the Iconify API
    // after mount — the pre-existing runtime path this file leaves untested to
    // keep jsdom free of orphaned loader timers.
    const html = renderToStaticMarkup(
      <Icon icon="lucide:name-that-is-bundled-nowhere" size={24} />,
    );

    expect(html).not.toContain("<svg");
    expect(html).toContain("<span");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Icon sprite scope", () => {
  it("inlines full glyphs outside a sprite scope", () => {
    const html = renderToStaticMarkup(
      <Icon icon="lucide:chevron-down" size={14} />,
    );

    expect(html).toContain("<path");
    expect(html).not.toContain("<use");
  });

  it("keeps every scoped glyph available before hydration while sharing repeated geometry", () => {
    const html = renderToStaticMarkup(
      <IconSpriteScope>
        <Icon
          icon="lucide:chevron-down"
          size={14}
          className="transition-transform"
        />
        <Icon icon="lucide:chevron-down" size={20} />
        <Icon icon="lucide:ellipsis" size={13} />
        <Icon icon="lucide:arrow-up" size="0.95em" />
        <Icon icon="lucide:key" size={16} />
        <Icon icon="lucide:tag" size={16} />
        <Icon icon="material-symbols:track-changes-rounded" size={16} />
      </IconSpriteScope>,
    );
    const root = document.createElement("div");
    root.innerHTML = html;
    const icons = root.querySelectorAll("svg.iconify");
    expect(icons).toHaveLength(7);
    for (const icon of icons) {
      const href = icon.querySelector("use")?.getAttribute("href");
      expect(href).toMatch(/^#/);
      const symbol = root.querySelector(href!);
      expect(
        symbol?.querySelector(
          "path, rect, circle, polygon, line, polyline, ellipse",
        ),
      ).not.toBeNull();
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    }
    expect(icons[0].querySelector("use")?.getAttribute("href")).toBe(
      icons[1].querySelector("use")?.getAttribute("href"),
    );
    expect(icons[0].getAttribute("width")).toBe("14");
    expect(icons[1].getAttribute("width")).toBe("20");
    expect(icons[0].classList.contains("transition-transform")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves icons outside the sprite list on the inline path inside a scope", () => {
    const html = renderToStaticMarkup(
      <IconSpriteScope>
        <Icon icon="lucide:menu" size={24} />
      </IconSpriteScope>,
    );

    expect(html).not.toContain('<use href="#dw-icon');
    expect(html).toContain("<path");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
