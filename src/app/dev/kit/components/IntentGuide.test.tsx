import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/context/ThemeContext";
import { IntentGuide, intentRows } from "./IntentGuide";
import { stories } from "../registry";

const FAMILIES = ["chips", "badges", "pills", "expand", "dividers", "cards", "surfaces"] as const;

describe("catalog intent guide", () => {
  it("routes every family to at least one registered story", () => {
    for (const family of FAMILIES) {
      expect(intentRows(family).map(({ story }) => story.id), family).not.toEqual([]);
    }
  });

  it("points every intent at an example that exists on its story", () => {
    for (const story of stories) {
      for (const intent of story.intents ?? []) {
        expect(story.examples[intent.example ?? 0], `${story.id}: ${intent.need}`).toBeDefined();
      }
    }
  });

  it("renders each recommended component and its policy link", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
        <IntentGuide />
      </ThemeProvider>,
    );
    expect(markup).toContain('href="#public-tokens"');
    expect(markup).toContain("docs/design/ui-kit.md#name-chip-policy");
    expect(markup).toContain("docs/design/ui-kit.md#expand-affordance-policy");
    expect(markup).toContain("docs/design/ui-kit.md#divider-policy");
    // The chip entry renders the PublicNameChip example, not just a label.
    expect(markup).toContain("theme-name-chip");
  });
});
