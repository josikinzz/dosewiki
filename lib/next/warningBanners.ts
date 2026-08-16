import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
} from "../convex/publicData.cache";
import { queryConvex } from "../convex/serverClient";
import {
  isWarningBannerLinkSection,
  isWarningBannerTone,
  normalizeEnabledSlugs,
  normalizeLinks,
  type WarningBannerLink,
  type WarningBannerPreset,
} from "../../src/data/substanceWarningBanners";

/**
 * Server read for the drug-class safety banners.
 *
 * One Convex read serves every banner on a page — `warningBanners:listPresets`
 * returns the whole (small) preset table — cached under
 * `PUBLIC_CONVEX_CACHE_TAGS.banners` so the Banner Studio save route can make an
 * enablement public immediately by revalidating that one tag.
 *
 * Resolution is NOT done here. This returns rows; `resolveEnabledBanners` in
 * `src/data/substanceWarningBanners.ts` decides what a given slug renders, and
 * it takes a slug, never a classification.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Keeps the strings and drops everything else. The ceilings live on the write
 * path (`src/app/api/dev/warning-banner/route.ts`) and in the Convex mutation;
 * re-checking lengths here would silently delete a stored bullet instead of
 * surfacing the row that broke the rule.
 */
function readStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  // `Array.isArray` on an `unknown` narrows to `any[]`; the annotation puts the
  // elements back to `unknown` so the predicate below is what proves the type.
  const entries: unknown[] = raw;
  return entries.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/**
 * Rows are re-parsed rather than trusted: a row written by an older deployment
 * can be missing a field this type now requires, and a half-populated banner is
 * worse than no banner. Reader-visible text (`icon`, `severityLabel`,
 * `headline`, `tone`) is required outright — a banner with a blank severity
 * gutter or a missing glyph is a broken warning. Everything else degrades to
 * the value that renders *less*: absent `enabled` is `false`, absent
 * `enabledSlugs` is `[]`, which is the opt-in default from
 * `src/data/substanceWarningBanners.ts`.
 */
function parseWarningBannerPreset(raw: unknown): WarningBannerPreset | null {
  if (!isRecord(raw)) {
    return null;
  }

  const { key, label, icon, severityLabel, headline, tone } = raw;
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    typeof label !== "string" ||
    typeof icon !== "string" ||
    icon.length === 0 ||
    typeof severityLabel !== "string" ||
    severityLabel.length === 0 ||
    typeof headline !== "string" ||
    headline.length === 0 ||
    !isWarningBannerTone(tone)
  ) {
    return null;
  }

  const rawLinks: unknown[] = Array.isArray(raw.links) ? raw.links : [];
  const links: WarningBannerLink[] = rawLinks.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.label !== "string") {
      return [];
    }
    // `normalizeLinks` also drops unknown targets, but narrowing here keeps the
    // array typed without a cast through `WarningBannerLink`.
    return isWarningBannerLinkSection(entry.sectionId)
      ? [{ label: entry.label, sectionId: entry.sectionId }]
      : [];
  });

  return {
    key,
    label,
    tone,
    icon,
    severityLabel,
    headline,
    points: readStringArray(raw.points),
    links: normalizeLinks(links),
    priority: typeof raw.priority === "number" && Number.isFinite(raw.priority) ? raw.priority : 0,
    enabled: raw.enabled === true,
    // `matchingPresets` compares against a trimmed, lower-cased slug, so a row
    // written by anything other than `src/app/api/dev/warning-banner/route.ts`
    // (a seed script, a console edit) would silently match nothing. The same
    // normalizer the write path uses runs here; it only trims, lower-cases, and
    // dedupes, so it can never add a slug the editor did not name.
    enabledSlugs: normalizeEnabledSlugs(readStringArray(raw.enabledSlugs)),
    candidateMatchers: readStringArray(raw.candidateMatchers),
  };
}

/**
 * The deliberate asymmetry with `lib/next/copyBlocks.ts`: copy blocks degrade to
 * the checked-in defaults in `src/data/content/copyBlocks.json`, because a
 * missing footer line is a visible hole on the page. A banner degrades to
 * nothing. There is no checked-in banner default and there must not be one — a
 * stale fallback could paint a safety warning onto an article an editor had
 * just switched it off on, and the opt-in invariant says a banner renders only
 * when a live row names the slug. Silence is the safe failure here.
 */
export const getWarningBannerPresets = cache(
  unstable_cache(
    async (): Promise<WarningBannerPreset[]> => {
      try {
        const rows = await queryConvex<unknown[]>("warningBanners:listPresets", {});
        if (!Array.isArray(rows)) {
          return [];
        }
        return rows.flatMap((row: unknown) => {
          const parsed = parseWarningBannerPreset(row);
          return parsed ? [parsed] : [];
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[banners] warningBanners:listPresets failed; no safety banners will render. Cause: ${message}`,
        );
        return [];
      }
    },
    ["convex-public-warning-banners"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.banners],
    },
  ),
);
