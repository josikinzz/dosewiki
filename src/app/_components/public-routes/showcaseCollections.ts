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
} from "@server/data/publicData";
import { getLocalizedPublicEffectBySlug, getLocalizedPublicEffects } from "@server/translation/localizedRecords";
import { localizeRecords } from "@server/translation/liveTranslation";

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
 * record, the by-effect chunks), so the section path costs no extra Postgres
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
      locale === "en" ? getPublicEffects() : getLocalizedPublicEffects(locale),
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
    const localizedReplications = locale === "en"
      ? gallery.items.map((item) => item.replication)
      : (await localizeRecords(gallery.items.map((item) => item.replication), locale, "replication")).records;
    const localizedItems = gallery.items.map((item, index) => ({ ...item, replication: localizedReplications[index] }));

    const effectNameBySlug = new Map(effects.map((effect) => [effect.slug, effect.name]));
    if (locale === "en") {
      for (const [effectSlug, name] of visualEffectNameBySlug(article.subjective_effects)) {
        effectNameBySlug.set(effectSlug, name);
      }
    }
    const works = buildShowcaseWorks(
      localizedItems,
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
    return {
      works,
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
      locale === "en" ? getPublicEffectBySlug(effectSlug) : getLocalizedPublicEffectBySlug(effectSlug, locale),
      getPublicReplicationsByEffect(effectSlug),
    ]);
    // Explicitly tagged collections can exist before an editorial effect article.
    if (!effect && replications.length === 0) return null;
    const effectName = effect?.name;
    const localizedReplications = locale === "en"
      ? replications
      : (await localizeRecords(replications, locale, "replication")).records;
    return {
      works: buildEffectShowcaseWorks(localizedReplications, {
        effectSlug,
        effectName,
        galleryOrder: effect?.gallery_order,
      }),
      effectName,
    };
  },
);
