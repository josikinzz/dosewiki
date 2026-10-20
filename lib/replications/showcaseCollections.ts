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
    const article = substance as unknown as SubstanceArticle;

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

export const getEffectShowcaseWorks = cache(
  async (
    effectSlug: string,
    locale: UiLocale = "en",
  ): Promise<{ works: ShowcaseWork[]; effectName?: string } | null> => {
    const [effect, replications] = await Promise.all([
      locale === "en" ? getPublicEffectBySlug(effectSlug) : getLocalizedPublicEffectBySlug(effectSlug, locale),
      getPublicReplicationsByEffect(effectSlug),
    ]);
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
