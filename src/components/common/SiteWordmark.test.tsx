import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { SiteWordmark } from "./SiteWordmark";

const { dosewiki, effectindex } = SITE_FLAVOR_CONFIGS;

describe("SiteWordmark", () => {
  it("emits the exact markup the dose.wiki chrome used to inline", () => {
    // The pre-flavor header/footer/hero literally rendered
    //   dose<span className="theme-accent-heading">.wiki</span>
    // inside their brand span. This asserts the refactor is a no-op for dose.wiki.
    const markup = renderToStaticMarkup(
      <span className="brand">
        <SiteWordmark config={dosewiki} />
      </span>,
    );

    expect(markup).toBe('<span class="brand">dose<span class="theme-accent-heading">.wiki</span></span>');
  });

  it("honours a caller-supplied accent class, as the footer needs", () => {
    const markup = renderToStaticMarkup(
      <SiteWordmark
        accentClassName="theme-accent-heading transition-opacity group-hover:opacity-85"
        config={dosewiki}
      />,
    );

    expect(markup).toBe(
      'dose<span class="theme-accent-heading transition-opacity group-hover:opacity-85">.wiki</span>',
    );
  });

  it("keeps one non-breaking space between the Effect Index wordmark runs", () => {
    const markup = renderToStaticMarkup(
      <span className="brand">
        <SiteWordmark config={effectindex} />
      </span>,
    );

    expect(markup).toBe(
      '<span class="brand">Effect <span class="theme-accent-heading">Index</span></span>',
    );
  });

  it("keeps both wordmarks joinable back into the flavor display name", () => {
    for (const config of [dosewiki, effectindex]) {
      expect(`${config.wordmark.lead}${config.wordmark.accent}`).toBe(config.name);
    }
  });
});
