import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/context/ThemeContext";
import { stories } from "./index";

const APPEARANCE_MATRIX = [
  { colorScheme: "light", visualStyle: "fun" },
  { colorScheme: "dark", visualStyle: "fun" },
  { colorScheme: "light", visualStyle: "pro" },
  { colorScheme: "dark", visualStyle: "pro" },
] as const;

/**
 * Render safety for the UI Kit catalog (/dev/kit).
 *
 * The catalog page is a client component, but Next still prerenders it to HTML
 * on the server at build time via react-dom/server. If any story example mounts
 * a component that throws during server render (e.g. it needs a provider that is
 * absent on an isolated dev page), the production build of /dev/kit breaks.
 *
 * Examples render inside a `ThemeProvider`, exactly as the catalog page does — the root
 * layout wraps the whole body in one — so a story that reads the reader's appearance is
 * checked here under the same context it gets in production, without every story having
 * to mount its own provider (nested providers would fight the catalog's live controls).
 *
 * This test renders every example of every registered story in all four appearance
 * combinations, so a style-dependent crash fails here instead of in `next build`.
 */
describe("UI Kit catalog render safety", () => {
  for (const story of stories) {
    it(`renders every "${story.id}" example without throwing`, () => {
      for (const [index, example] of story.examples.entries()) {
        for (const appearance of APPEARANCE_MATRIX) {
          expect(
            () =>
              renderToStaticMarkup(
                <ThemeProvider
                  initialColorScheme={appearance.colorScheme}
                  initialVisualStyle={appearance.visualStyle}
                  isVisualStyleLocked={false}
                >
                  {example.render()}
                </ThemeProvider>,
              ),
            `Story "${story.id}" example #${index} ("${example.label}") threw in ` +
              `${appearance.visualStyle} ${appearance.colorScheme}. If it needs provider data ` +
              `that an isolated dev page cannot supply, render a reference example instead ` +
              `(see docs/ui-kit.md).`,
          ).not.toThrow();
        }
      }
    });
  }
});
