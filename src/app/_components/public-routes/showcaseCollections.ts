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
import type { UiLocale } from "@/i18n/messages";
import { t } from "@/i18n/server";
import { publicHref } from "@/utils/publicHref";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import {
  getPublicContributorProfiles,
  getPublicEffectBySlug,
  getPublicEffects,
  getPublicReplicationsByEffect,
  getPublicReplicationsForSubstance,
  getPublicSubstanceBySlug,
} from "@server/convex/publicData";
import { getLocalizedEffectNames } from "@server/translation/localizedRecords";

/**
 * The two lazily fetchable showcase collections, shared verbatim between the
 * streamed article sections, `/api/replications/showcase`, and the publisher
 * `/embed/replications` player. Articles serialize only the compact strip
 * (`SHOWCASE_WORK_CAP` works); the viewer's long tail comes through the route.
 * All callers share the opening policy in `showcaseModel`, so a deep link or
 * embedded playlist cannot disagree with the article's ordering.
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
 * contributor profiles. Null when the slug names no substance. A work whose
 * effect the article never chips takes the effect index's name, so the store
 * can translate it like any other effect title; only a slug the index does
 * not know humanises. On a locale mirror the names come back as the store
 * translates them; the matcher itself always runs on the English article.
 */
export const getSubstanceShowcaseWorks = cache(
  async (
    slug: string,
    locale: UiLocale = "en",
  ): Promise<{ works: ShowcaseWork[]; collectionLabel: string } | null> => {
    const [substance, gallery, effects] = await Promise.all([
      getPublicSubstanceBySlug(slug),
      getPublicReplicationsForSubstance(slug),
      getPublicEffects(),
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

    const effectNameBySlug = new Map(effects.map((effect) => [effect.slug, effect.name]));
    for (const [effectSlug, name] of visualEffectNameBySlug(article.subjective_effects)) {
      effectNameBySlug.set(effectSlug, name);
    }
    const works = buildShowcaseWorks(
      gallery.items,
      effectNameBySlug,
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
      gallery.carouselOrder,
    );
    const effectNames = await getLocalizedEffectNames(works.map((work) => work.effectName), locale);
    return {
      works: works.map((work) => ({ ...work, effectName: effectNames.get(work.effectName) ?? work.effectName })),
      collectionLabel: t("{{name}} replications", { name: article.title }),
    };
  },
);

/**
 * The effect article's complete ordered collection: every public row for the
 * effect, with authoritative `gallery_order` followed by automatically ordered
 * uncurated works. Article, viewer, and embed all consume this same sequence.
 */
export const getEffectShowcaseWorks = cache(
  async (
    effectSlug: string,
    locale: UiLocale = "en",
  ): Promise<{ works: ShowcaseWork[]; effectName?: string } | null> => {
    const [effect, replications] = await Promise.all([
      getPublicEffectBySlug(effectSlug),
      getPublicReplicationsByEffect(effectSlug),
    ]);
    // Explicitly tagged collections can exist before an editorial effect article.
    if (!effect && replications.length === 0) return null;
    const effectName = effect
      ? (await getLocalizedEffectNames([effect.name], locale)).get(effect.name)
      : undefined;
    return {
      works: buildEffectShowcaseWorks(replications, {
        effectSlug,
        effectName,
        galleryOrder: effect?.gallery_order,
      }),
      effectName,
    };
  },
);
