import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { stories } from "./index";

/**
 * Render safety for the UI Kit catalog (/dev/kit).
 *
 * The catalog page is a client component, but Next still prerenders it to HTML
 * on the server at build time via react-dom/server. If any story example mounts
 * a component that throws during server render (e.g. it needs a provider that is
 * absent on an isolated dev page), the production build of /dev/kit breaks.
 *
 * This test renders every example of every registered story through the same
 * server renderer, so such a crash fails here — fast — instead of in `next build`.
 */
describe("UI Kit catalog render safety", () => {
  for (const story of stories) {
    it(`renders every "${story.id}" example without throwing`, () => {
      for (const [index, example] of story.examples.entries()) {
        expect(
          () => renderToStaticMarkup(<>{example.render()}</>),
          `Story "${story.id}" example #${index} ("${example.label}") threw during ` +
            `server render. If it needs a provider/data it cannot get on an isolated ` +
            `dev page, render a reference example instead (see docs/ui-kit.md).`,
        ).not.toThrow();
      }
    });
  }
});
