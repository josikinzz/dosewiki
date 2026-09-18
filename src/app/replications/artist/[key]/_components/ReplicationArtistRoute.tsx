import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { ArtistIdentityHeader } from "@/features/replications/artist/ArtistIdentityHeader";
import { ArtistShowcase } from "@/features/replications/artist/ArtistShowcase";
import ArtistProfileEditor from "@/features/replications/artist/ArtistProfile.editor";
import {
  artistPagePublicLinks,
  buildArtistShowcaseGroup,
  showcaseWorkFromPreview,
} from "@/features/replications/artist/artistPageModel";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";
import {
  canonicalArtistPageRedirectKey,
  resolveArtistPageProfileKey,
  resolveGalleryFocus,
  type ResolvedGalleryFocus,
} from "@/features/replications/galleryFocus";
import { getReplicationArtistRouteAlias } from "@server/next/publicRouteAliases";
import { buildGalleryBrowseUrl } from "@/features/replications/galleryUrlState";
import {
  viewerCollectionFromGalleryGroups,
  type ReplicationViewerCollection,
} from "@/features/replications/viewer/viewerModel";
import {
  effectNameLookup,
  UNATTRIBUTED_KEY,
} from "@/features/effects/gallery/galleryArtistIdentity";
import { ProfileBioMarkdown } from "@/components/pages/ProfileBioMarkdown";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import {
  getPublicContributorByKey,
  getPublicContributorIdentity,
  type PublicEffectPreview,
} from "@server/data/publicData";
import {
  getLocalizedEffectNames,
  getLocalizedPublicContributorByKey,
} from "@server/translation/localizedRecords";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import {
  buildPublicPageMetadata,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";
import { t } from "@/i18n/server";
import { getGalleryBrowseIndex, hydrateGalleryPage } from "@server/next/galleryBrowseIndex";

/**
 * The Artist Page: one artist's works, addressable as
 * /replications/artist/<key> — every credited artist's single public surface
 * (see the address decision record in
 * src/features/replications/galleryFocus.ts). Unclaimed keys derive from
 * gallery credit lines; claimed identities use the profile display-name key
 * and retain old credit-line keys as redirects. `unknown` names the
 * unattributed bucket, and an unrecognized key is a real 404 rather than an
 * empty page. When a Contributor Profile claims the credit line, the identity
 * header is decorated with their avatar, role, bio, and links;
 * /contributors/<key> permanently forwards here for such profiles. The
 * Unattributed bucket gets the same works view but never an identity claim.
 * Advertised in the sitemap from the same gallery corpus, but detail pages
 * scale with reader demand rather than roster size: a real key renders on
 * first request and then enters the hourly ISR cache; all reads sit on the
 * shared hourly `unstable_cache`
 * window. The `?viewer=` deep link is resolved on the client inside
 * ArtistShowcase against the artist's whole collection.
 *
 * Like the playlist pages, this sits outside the `(tabs)` group on purpose: a
 * profile is not a section view, so it gets no "Replications" masthead or tab
 * bar and brings its own `<main>`. The works render as one showcase stage
 * over the whole body of work rather than the browse gallery's masonry: a
 * profile presents a body of work, it is not a querying surface.
 *
 * The English route and every locale mirror render this same component; a
 * mirror passes its locale so canonical works, effect names, and profile prose
 * are localized before display projection while artist identity stays original.
 */

interface LoadedArtistFocus {
  replications: PublicGalleryReplicationPreview[];
  effects: Array<Pick<PublicEffectPreview, "slug" | "name">>;
  contributorDirectory: ContributorDirectory;
  focus: ResolvedGalleryFocus | null;
}

const loadArtistFocus = cache(async (
  key: string,
  locale: LiveLocale | null,
): Promise<LoadedArtistFocus> => {
  // Artist URL identity is canonical and does not depend on translated titles.
  // Resolve the requested/aliased key before touching localization so a zh
  // artist permalink does not translate the complete gallery merely to find
  // one canonical group.
  const index = await getGalleryBrowseIndex("en");
  const focus = resolveGalleryFocus({ kind: "artist", key }, index.rows, {
    effects: index.effects,
    contributorDirectory: index.directory,
  });
  const effectSlugs = new Set(
    focus?.group.items.flatMap((item) => item.effect_tags ?? []) ?? [],
  );
  if (focus?.group.items.some((item) => item.effect_slug)) {
    for (const item of focus.group.items) {
      if (item.effect_slug) effectSlugs.add(item.effect_slug);
    }
  }
  const canonicalEffects = index.effects.filter((effect) =>
    effectSlugs.has(effect.slug),
  );
  const localizedNames = locale
    ? await getLocalizedEffectNames(
        canonicalEffects.map((effect) => effect.name),
        locale.code,
      )
    : null;

  return {
    replications: index.rows,
    effects: localizedNames
      ? canonicalEffects.map((effect) => ({
          ...effect,
          name: localizedNames.get(effect.name) ?? effect.name,
        }))
      : canonicalEffects,
    contributorDirectory: index.directory,
    focus,
  };
});

/**
 * A key that resolves to no group is a 404 — unless it is a retired alias
 * (the folded "Anonymous" marker section), whose old address forwards to the
 * page that now holds its works.
 */
function forwardRetiredKeyOr404(key: string): never {
  const aliasTarget = getReplicationArtistRouteAlias(key);
  if (aliasTarget) {
    permanentRedirect(
      getPublicRoutePath({
        family: "replicationArtist",
        params: { key: aliasTarget },
      }),
    );
  }
  notFound();
}

export async function getReplicationArtistMetadata(
  key: string,
  locale: LiveLocale | null = null,
): Promise<Metadata> {
  const { focus, contributorDirectory } = await loadArtistFocus(key, locale);

  // Thrown here, not just in the page body: metadata resolves before the
  // response starts streaming, so this is what turns a bogus key into a real
  // HTTP 404 instead of a soft 404 streamed into an already-committed 200.
  if (!focus) {
    forwardRetiredKeyOr404(key);
  }

  const attributed = focus.group.key !== UNATTRIBUTED_KEY;
  const profileKey = resolveArtistPageProfileKey(
    focus.group,
    contributorDirectory,
  );
  return buildPublicPageMetadata({
    title: t("{{name}} Replications", { name: focus.label }),
    description: attributed
      ? `${focus.group.count} replication ${focus.group.count === 1 ? "work" : "works"} by ${focus.label}: image and video recreations of subjective effects.`
      : "Replication works whose creator is unknown: image and video recreations of subjective effects awaiting attribution.",
    route: { family: "replicationArtist", params: { key: focus.key } },
    noIndex: locale !== null,
    socialImage: profileKey
      ? entitySocialCardImage(
          "contributors",
          profileKey,
          `${focus.label} contributor profile card`,
        )
      : undefined,
  });
}

export async function ReplicationArtistRoute({
  artistKey: key,
  locale = null,
}: {
  artistKey: string;
  locale?: LiveLocale | null;
}) {
  const { effects, contributorDirectory, focus } = await loadArtistFocus(key, locale);

  if (!focus) {
    forwardRetiredKeyOr404(key);
  }

  // A source-era handle remains resolvable, but a claimed merged identity has
  // exactly one public address: the profile's canonical display-name key.
  // This redirect changes no stored replication credit or search token.
  const canonicalRedirectKey = canonicalArtistPageRedirectKey(key, focus);
  if (canonicalRedirectKey) {
    permanentRedirect(
      getPublicRoutePath({
        family: "replicationArtist",
        params: { key: canonicalRedirectKey },
      }),
    );
  }

  // The claimed Contributor Profile decorates the page; the Unattributed
  // bucket never resolves one (resolveArtistPageProfileKey), and an unclaimed
  // credit renders the same page shape without avatar image, role, or links.
  const profileKey = resolveArtistPageProfileKey(
    focus.group,
    contributorDirectory,
  );
  const [profile, identity] = profileKey
    ? await Promise.all([
        locale
          ? getLocalizedPublicContributorByKey(profileKey, locale.code)
          : getPublicContributorByKey(profileKey),
        getPublicContributorIdentity(profileKey),
      ])
    : [null, null];

  const attributed = focus.group.key !== UNATTRIBUTED_KEY;
  const effectName = effectNameLookup(effects);
  const avatarUrl = identity?.avatar_url ?? profile?.avatarUrl ?? null;
  const sourcePath = getPublicRoutePath({
    family: "replicationArtist",
    params: { key: focus.key },
  });

  // Only the opening strip crosses the server/client boundary. The same
  // focused collection resolves on viewer intent, including distant deep links.
  const group = buildArtistShowcaseGroup(focus.group.items, t);
  const openingItems = await hydrateGalleryPage(group.items.slice(0, SHOWCASE_WORK_CAP), locale?.code === "zh-Hans" ? "zh-Hans" : "en");
  const collectionLabel = attributed
    ? t("Works by {{name}}", { name: focus.label })
    : t("Unattributed works");
  const collection: ReplicationViewerCollection = {
    ...viewerCollectionFromGalleryGroups(
      [{ ...group, items: openingItems }],
      "effect",
      sourcePath,
      effectName,
      () => avatarUrl,
    ),
    label: collectionLabel,
    kind: "artist",
    grouping: "none",
    editorTarget: attributed
      ? {
          kind: "artist",
          key: profile?.key ?? focus.key,
          label: collectionLabel,
        }
      : undefined,
  };
  const works = openingItems.map((item) =>
    showcaseWorkFromPreview(item, effectName(item.effect_slug), avatarUrl),
  );

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full px-4 pb-20 pt-4 focus:outline-none 2xl:px-8"
    >
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <ArtistIdentityHeader
          name={focus.label}
          browseAllHref={buildGalleryBrowseUrl({ view: "artist" })}
          attributed={attributed}
          avatarUrl={avatarUrl}
          verifiedReplicator={identity?.verified_replicator === true}
          approvedReplicator={profile?.approved_replicator === true}
          role={profile?.role}
          bio={
            profile?.hasCustomBio ? (
              <ProfileBioMarkdown content={profile.bio} />
            ) : attributed ? null : (
              <p>
                {t("Image and video recreations of subjective effects whose creator is unknown, awaiting attribution.")}
              </p>
            )
          }
          links={artistPagePublicLinks(
            profile?.links ?? [],
            focus.group.externalUrl,
            profile !== null,
          )}
          counts={{
            count: focus.group.count,
            imageCount: focus.group.imageCount,
            videoCount: focus.group.videoCount,
          }}
        />
        {locale ? null : (
          <ArtistProfileEditor profileKey={profile?.key ?? null} attributed={attributed} counts={{ count: focus.group.count, imageCount: focus.group.imageCount, videoCount: focus.group.videoCount }} verifiedReplicator={identity?.verified_replicator === true} />
        )}
        <ArtistShowcase
          label={collectionLabel}
          works={works}
          totalCount={group.count}
          collection={collection}
          sourcePath={sourcePath}
          artistKey={focus.key}
        />
      </div>
    </main>
  );
}
