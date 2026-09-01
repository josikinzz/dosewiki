import "server-only";

import { cache } from "react";

import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import {
  buildEffectShowcaseWorks,
  buildShowcaseWorks,
  visualEffectNameBySlug,
} from "@/features/replications/components/showcaseModel";
import type { ShowcaseWork } from "@/features/replications/components/showcaseWork";
import type { SubstanceArticle } from "@/schema";
import { publicHref } from "@/utils/publicHref";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import {
  getPublicContributorProfiles,
  getPublicEffectBySlug,
  getPublicReplicationsByEffect,
  getPublicReplicationsForSubstance,
  getPublicSubstanceBySlug,
} from "@server/convex/publicData";

/**
 * The two lazily fetchable showcase collections, shared verbatim between the
 * streamed article sections and `/api/replications/showcase`. Articles
 * serialize only the compact strip (`SHOWCASE_WORK_CAP` works); the expanded
 * viewer's long tail comes back through the route, so both callers MUST walk
 * one code path or a deep link could resolve against a differently ordered
 * collection than the strip was cut from.
 *
 * Every read below is the same request-deduped public-data call the article
 * render performs, backed by top-level `unstable_cache` leaves (the substance
 * record, the one-shot substance gallery or its corpus pages, the effect
 * record, the by-effect chunks), so the section path costs no extra Convex
 * traffic over what the route loader already paid.
 */

/**
 * The substance article's complete ordered collection: the per-substance
 * matcher's gallery flattened by `buildShowcaseWorks`, with effect names
 * inverted from the article's own chips and bylines resolved against claimed
 * contributor profiles. Null when the slug names no substance.
 */
export const getSubstanceShowcaseWorks = cache(
  async (
    slug: string,
  ): Promise<{ works: ShowcaseWork[]; collectionLabel: string } | null> => {
    const [substance, gallery] = await Promise.all([
      getPublicSubstanceBySlug(slug),
      getPublicReplicationsForSubstance(slug),
    ]);
    if (!substance) return null;
    // Same projection the article view model applies before rendering.
    const article = substance as SubstanceArticle;

    // Bylines link the Artist Page when the work proves one exists; the
    // profile resolver below is only the fallback for works withheld from
    // artist views. Only a credit that names a person can resolve to a
    // profile; a gallery of unattributed works skips the read rather than
    // paying for a lookup that cannot succeed.
    const anyKnownCreator = gallery.items.some((item) =>
      hasKnownCreator(item.replication.artist),
    );
    const contributorProfiles = anyKnownCreator
      ? await getPublicContributorProfiles()
      : [];

    const works = buildShowcaseWorks(
      gallery.items,
      visualEffectNameBySlug(article.subjective_effects),
      (artistName) => {
        const profile = findContributorProfileByAuthorName(
          contributorProfiles,
          artistName,
        );
        return profile ? publicHref.contributor(profile.key) : null;
      },
      (artistName) =>
        findContributorProfileByAuthorName(contributorProfiles, artistName)
          ?.avatarUrl ?? null,
    );
    return { works, collectionLabel: `${article.title} replications` };
  },
);

/**
 * The effect article's complete ordered collection: every public row for the
 * effect, curated by the record's own `gallery_order` — the same field
 * `getEffectArticleReplicationState` reads to gate the section — and
 * flattened by `buildEffectShowcaseWorks`. Null when the slug names no
 * effect.
 */
export const getEffectShowcaseWorks = cache(
  async (
    effectSlug: string,
  ): Promise<{ works: ShowcaseWork[]; effectName?: string } | null> => {
    const [effect, replications] = await Promise.all([
      getPublicEffectBySlug(effectSlug),
      getPublicReplicationsByEffect(effectSlug),
    ]);
    if (!effect) return null;
    return {
      works: buildEffectShowcaseWorks(replications, {
        effectSlug,
        effectName: effect.name,
        galleryOrder: effect.gallery_order,
      }),
      effectName: effect.name,
    };
  },
);
