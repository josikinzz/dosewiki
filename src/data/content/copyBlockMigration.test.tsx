import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { COPY_BLOCK_DEFAULTS, getCopyBlockDefault } from "./copyBlocks";
import { applyPlaceholders } from "./about";
import { EFFECT_CATEGORY_DEFINITIONS } from "../effectCategoryDefinitions";
import psychoactiveIndexManual from "../indexes/psychoactiveIndexManual.json";
import { TABS } from "@/features/effects/pages/effectsIndexConfig";
import {
  SEIIntroSection,
  SEI_INTRO_COPY_FALLBACK,
} from "@/features/effects/components/SEIIntroSection";
import { renderInlineCopy } from "@/components/common/InlineCopy";

/**
 * The copy migration's central promise: until a block is seeded and edited, a
 * migrated surface renders exactly the string it hardcoded before. That holds
 * only while each checked-in default stays equal to the fallback still sitting
 * in the code, so this pins the two together — a drifting default would
 * silently change public prose the first time a deployment is seeded.
 */

function bodyOf(key: string): string {
  const definition = getCopyBlockDefault(key);
  expect(definition, `missing copy default for ${key}`).toBeTruthy();
  return definition?.body ?? "";
}

describe("copy block defaults", () => {
  it("hold unique, seedable, kebab-case keys", () => {
    const keys = COPY_BLOCK_DEFAULTS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key, `${key} is not seedable`).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it("carry a payload for every block", () => {
    for (const definition of COPY_BLOCK_DEFAULTS) {
      if (definition.kind === "list") {
        expect(definition.items?.length, `${definition.key} has no items`).toBeGreaterThan(0);
      } else {
        expect(definition.body, `${definition.key} has no body`).toBeTruthy();
      }
    }
  });

  it("match the psychoactive category definitions they replaced", () => {
    const categories = psychoactiveIndexManual.categories as {
      key: string;
      definition?: string;
    }[];

    for (const category of categories) {
      const definition = category.definition?.trim();
      if (!definition) continue;
      expect(bodyOf(`substances-category-${category.key}`)).toBe(definition);
    }
  });

  it("match all effect category descriptions they replaced", () => {
    expect(EFFECT_CATEGORY_DEFINITIONS.length).toBeGreaterThan(0);
    for (const definition of EFFECT_CATEGORY_DEFINITIONS) {
      expect(bodyOf(`effects-category-${definition.slug}`)).toBe(definition.description);
    }
  });

  it("match the effects index tab blobs they replaced", () => {
    for (const tab of TABS) {
      if (!tab.blob) continue;
      expect(bodyOf(`effects-index-tab-${tab.id}`)).toBe(tab.blob);
    }
  });

  it("match the SEI intro fallbacks they replaced", () => {
    expect(bodyOf("effects-index-intro-lead")).toBe(SEI_INTRO_COPY_FALLBACK.lead);
    expect(bodyOf("effects-index-intro-method")).toBe(SEI_INTRO_COPY_FALLBACK.method);
    expect(bodyOf("effects-index-intro-organisation")).toBe(
      SEI_INTRO_COPY_FALLBACK.organisation,
    );
  });
});

describe("migrated surfaces render the pre-migration text", () => {
  it("substance index intro reads as it did before the copy CMS", () => {
    // The pre-migration string, built by the page's own `formatLabel` helper.
    const substanceCount = 412;
    const categoryCount = 11;
    const before = `Browse **${substanceCount} substance articles** focused on education and harm reduction, organized across **${categoryCount} psychoactive classes**. Open any page below to explore detailed information including: *dosage & duration, subjective effects, reagent testing, pharmacology, interactions, harm potential, history & culture, legality, and further reading.*`;

    expect(
      applyPlaceholders(bodyOf("substances-index-intro"), {
        substanceCount,
        categoryCount,
      }),
    ).toBe(before);
  });

  it("SEI intro lead renders the same sentence, with the accent phrase intact", () => {
    render(<SEIIntroSection effectCount={397} />);

    expect(
      screen.getByText(/is a comprehensive catalogue of 397 subjective effects/),
    ).toBeTruthy();
    // The `**…**` marker is presentation, never literal text.
    expect(document.body.textContent).not.toContain("**");
    expect(document.body.textContent).toContain(
      "The Subjective Effect Index is a comprehensive catalogue of 397 subjective effects that may occur under the influence of psychoactive substances.",
    );
  });

  it("reports index intro renders its inline link rather than raw markdown", () => {
    render(<p>{renderInlineCopy(bodyOf("reports-index-intro"))}</p>);

    const link = screen.getByRole("link", { name: "Subjective Effect Index" });
    expect(link.getAttribute("href")).toBe("/effects");
    expect(document.body.textContent).toBe(
      "First-person accounts of substance experiences, consistently formatted and cross-referenced with the Subjective Effect Index.",
    );
  });
});
