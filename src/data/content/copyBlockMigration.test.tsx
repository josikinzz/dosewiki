import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { COPY_BLOCK_DEFAULTS, getCopyBlockDefault } from "./copyBlocks";
import { EFFECT_CATEGORY_DEFINITIONS } from "../effectCategoryDefinitions";
import psychoactiveIndexManual from "@data/substances/psychoactiveIndexManual.json";
import { TABS } from "@/features/effects/pages/effectsIndexConfig";
import {
  SEIIntroSection,
  SEI_INTRO_COPY_FALLBACK,
} from "@/features/effects/components/SEIIntroSection";
import { HomeIntro } from "@/features/effect-index/home/HomeIntro";
import {
  EFFECT_INDEX_HOME_INTRO_FALLBACK,
  EFFECT_INDEX_HOME_PANEL_BLURB_FALLBACKS,
} from "@/features/effect-index/home/homeIntroCopy";
import {
  DOSAGE_PANEL_DISCLAIMER_FALLBACK,
  DOSAGE_PANEL_DISCLAIMER_KEY,
  TOLERANCE_SECTION_DISCLAIMER_FALLBACK,
  TOLERANCE_SECTION_DISCLAIMER_KEY,
} from "@/features/article/components/sections/articleDisclaimerCopy";
import {
  EXPERT_REVIEW_CREDIT_FALLBACK,
  EXPERT_REVIEW_CREDIT_KEY,
  REVIEW_STATUS_BANNER_FALLBACK,
  REVIEW_STATUS_BANNER_KEY,
  splitReviewerCopy,
} from "@/features/article/components/sections/articleReviewCopy";
import { ReviewStatusBanner } from "@/features/article/components/sections/ReviewStatusBanner";
import type { SubstanceArticle } from "@/schema";
import { ReplicationsFairUseNotice } from "@/features/replications/components/ReplicationsFairUseNotice";
import {
  REPLICATIONS_FAIR_USE_NOTICE_FALLBACK,
  REPLICATIONS_FAIR_USE_NOTICE_KEY,
} from "@/features/replications/replicationsFairUseCopy";
import {
  REPLICATIONS_INTRO_FALLBACK,
  REPLICATIONS_INTRO_KEY,
} from "@/features/replications/replicationsInfoCopy";

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

  it("match the Effect Index homepage fallbacks they replaced", () => {
    expect(bodyOf("effect-index-home-intro-lead")).toBe(EFFECT_INDEX_HOME_INTRO_FALLBACK.lead);
    expect(bodyOf("effect-index-home-intro-method")).toBe(
      EFFECT_INDEX_HOME_INTRO_FALLBACK.method,
    );
    expect(bodyOf("effect-index-home-intro-organisation")).toBe(
      EFFECT_INDEX_HOME_INTRO_FALLBACK.organisation,
    );
    expect(getCopyBlockDefault("effect-index-home-panel-blurbs")?.items).toEqual([
      ...EFFECT_INDEX_HOME_PANEL_BLURB_FALLBACKS,
    ]);
  });


  it("match the SEI intro fallbacks they replaced", () => {
    expect(bodyOf("effects-index-intro-lead")).toBe(SEI_INTRO_COPY_FALLBACK.lead);
    expect(bodyOf("effects-index-intro-method")).toBe(SEI_INTRO_COPY_FALLBACK.method);
    expect(bodyOf("effects-index-intro-organisation")).toBe(
      SEI_INTRO_COPY_FALLBACK.organisation,
    );
  });

  it("match the article disclaimers the sections fall back to", () => {
    expect(bodyOf(DOSAGE_PANEL_DISCLAIMER_KEY)).toBe(DOSAGE_PANEL_DISCLAIMER_FALLBACK);
    expect(bodyOf(TOLERANCE_SECTION_DISCLAIMER_KEY)).toBe(
      TOLERANCE_SECTION_DISCLAIMER_FALLBACK,
    );
  });

  it("match the review sentences the banner and credit fall back to", () => {
    expect(bodyOf(REVIEW_STATUS_BANNER_KEY)).toBe(REVIEW_STATUS_BANNER_FALLBACK);
    expect(bodyOf(EXPERT_REVIEW_CREDIT_KEY)).toBe(EXPERT_REVIEW_CREDIT_FALLBACK);
    // Both defaults carry the reviewer token, so the linked credit renders.
    expect(splitReviewerCopy(bodyOf(REVIEW_STATUS_BANNER_KEY)).hasReviewer).toBe(true);
    expect(splitReviewerCopy(bodyOf(EXPERT_REVIEW_CREDIT_KEY)).hasReviewer).toBe(true);
  });

  it("match the replications More Info description the tab falls back to", () => {
    expect(bodyOf(REPLICATIONS_INTRO_KEY)).toBe(REPLICATIONS_INTRO_FALLBACK);
    expect(getCopyBlockDefault(REPLICATIONS_INTRO_KEY)?.kind).toBe("markdown");
  });

  it("match the replications fair-use notice the gallery falls back to", () => {
    expect(bodyOf(REPLICATIONS_FAIR_USE_NOTICE_KEY)).toBe(
      REPLICATIONS_FAIR_USE_NOTICE_FALLBACK,
    );
    // The Copy Studio rail derives its groups from these definitions, so the
    // notice files under the existing Replications group instead of opening a
    // new rail section, and edits as markdown.
    const definition = getCopyBlockDefault(REPLICATIONS_FAIR_USE_NOTICE_KEY);
    expect(definition?.kind).toBe("markdown");
    expect(definition?.group).toBe("Replications");
  });
});

describe("migrated surfaces render the pre-migration text", () => {
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

  it("Effect Index homepage intro renders its links and count, not raw markdown", () => {
    render(<HomeIntro effectCount={233} />);

    expect(
      screen.getByRole("link", { name: "Subjective Effect Index" }).getAttribute("href"),
    ).toBe("/effects");
    expect(document.body.textContent).not.toContain("**");
    expect(document.body.textContent).toContain(
      "Effect Index, is a resource dedicated to establishing the field of formalised subjective effect documentation.",
    );
    expect(document.body.textContent).toContain("which contains 233 effect descriptions");
  });

  it("replications fair-use notice renders its takedown and licensing links, not raw markdown", () => {
    render(
      <ReplicationsFairUseNotice body={bodyOf(REPLICATIONS_FAIR_USE_NOTICE_KEY)} />,
    );

    expect(
      screen.getByRole("link", { name: "contact@dose.wiki" }).getAttribute("href"),
    ).toBe("mailto:contact@dose.wiki");
    expect(
      screen.getByRole("link", { name: "licensing terms" }).getAttribute("href"),
    ).toBe("/docs/license#replication-media-terms");
    expect(screen.getByRole("link", { name: "licensing terms" })).toHaveClass(
      "theme-accent-underline",
      "decoration-dotted",
    );
    expect(document.body.textContent).not.toContain("**");
    expect(document.body.textContent).toContain("Why this art is here.");
  });

  it("drops unsupported underline tags without leaking them into replication copy", () => {
    render(
      <ReplicationsFairUseNotice
        body="Read the <u>[licensing terms](/docs/license#replication-media-terms)</u>."
      />,
    );

    expect(screen.getByRole("link", { name: "licensing terms" })).toHaveClass(
      "theme-accent-underline",
      "decoration-dotted",
    );
    expect(document.body.textContent).not.toContain("<u>");
    expect(document.body.textContent).not.toContain("</u>");
  });

  it("review status banner renders the pre-migration sentence with Lyrea substituted", () => {
    // Partial article, same idiom as ReviewStatusBanner.test.tsx's fixtures.
    const article = {
      title: "2C-B",
      editorial_review: { status: "pending" },
    } as unknown as SubstanceArticle;
    render(
      <ReviewStatusBanner
        article={article}
        profileHref="/contributors/lyrea"
        copy={bodyOf(REVIEW_STATUS_BANNER_KEY)}
      />,
    );

    expect(document.body.textContent).toContain(
      "Not yet reviewed: this article is pending editorial review by Lyrea.",
    );
    expect(document.body.textContent).not.toContain("{{");
  });
});
