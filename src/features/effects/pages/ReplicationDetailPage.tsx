import Link from "next/link";

import { AppImage } from "@/components/common/AppImage";
import {
  DefinitionList,
  DefinitionRow,
} from "@/components/common/DefinitionList";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import {
  PublicNameChip,
  PublicOverline,
  PublicPill,
} from "@/components/common/PublicTokens";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import { ContentCard, NestedContentCard, Surface } from "@/components/ui/surface";
import { AudioReplicationPlayer } from "@/features/effects/components/AudioReplicationPlayer";
import { audioWaveformBars } from "@/features/replications/audioWaveform";
import { t } from "@/i18n/server";
import {
  getExternalSourceUrl,
  getRightsSummary,
} from "@/features/effects/components/replicationCredit";
import { buildReplicationViewerUrl } from "@/features/replications/galleryUrlState";
import type { ReplicationWithUrl } from "@/types/replications";
import type { PublicReplicationIdentityAttribution } from "@server/data/publicData";
import { publicHref } from "@/utils/publicHref";
import { buildAttributionLine } from "./replicationAttribution";
import type { EffectCategoryLink } from "./replicationSubject";

export interface ReplicationDetailPageProps {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  artistProfileHref: string | null;
  identityAttribution?: PublicReplicationIdentityAttribution | null;
  effectCategories: EffectCategoryLink[];
}

const termClassName = "theme-text-faint text-xs uppercase tracking-[0.18em]";
const bodyClassName = "theme-text-secondary text-sm leading-6";

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / 1_000_000;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1000)} kB`;
}

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Stable provenance page for one work. Playback and collection exploration
 * belong exclusively to the canonical overlay on the linked source page; the
 * header button is the one accessible route there, and the preview doubles as
 * a sighted-user shortcut to the same place.
 *
 * Every provenance fact renders exactly once, in its strongest place: the
 * byline is the credit, the licence row is the rights posture, and the
 * copyable attribution well only exists when an explicit licence gives a
 * reuser something to satisfy.
 */
export function ReplicationDetailPage({
  replication,
  effectName,
  effectSlug,
  artistProfileHref,
  identityAttribution = null,
  effectCategories,
}: ReplicationDetailPageProps) {
  const collectionPath = effectSlug
    ? publicHref.effect(effectSlug)
    : publicHref.replications();
  const viewerHref = buildReplicationViewerUrl(
    collectionPath,
    replication.slug,
  );
  const isVideo = replication.type === "video";
  const isAudio = replication.type === "audio";
  const isGif = replication.format?.toLowerCase() === "gif";
  // A clip has no frame to preview, so it never reaches the image layer: it
  // gets the player itself, which is more use here than a poster would be.
  const previewSource = isAudio
    ? undefined
    : isGif
      ? replication.motion_poster_url
      : isVideo
        ? replication.thumbnail_url
        : replication.url ?? replication.thumbnail_url;
  const artistName =
    identityAttribution?.creator.display_name.trim() ||
    replication.artist?.trim() ||
    t("Unattributed");
  const sourceUrl = getExternalSourceUrl(replication);
  const attribution = buildAttributionLine(replication);
  const fileSize = formatFileSize(replication.file_size);
  const duration = formatDuration(replication.duration);
  const [correctionBefore, correctionAfter] = t(
    "To correct a credit or request removal, see the {{terms}}.",
  ).split("{{terms}}");

  return (
    <PublicContentShell focusTarget>
      <Link href={publicHref.replications()} className={proseLinkClassName}>
        <Icon
          icon="lucide:arrow-left"
          className="mr-1 inline-block h-4 w-4"
          aria-hidden
        />
        {t("Replications")}
      </Link>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="theme-text-primary font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {replication.title}
          </h1>
          <p className="theme-text-muted mt-1.5 text-sm">
            {artistProfileHref ? (
              <Link href={artistProfileHref} className={proseLinkClassName}>
                {artistName}
              </Link>
            ) : (
              artistName
            )}
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href={viewerHref}>
            <Icon
              icon={isVideo || isAudio ? "lucide:play" : "lucide:maximize-2"}
              className="h-4 w-4"
              aria-hidden
            />
            {effectName
              ? t("Open in {{name}} replications", { name: effectName })
              : t("Open in viewer")}
          </Link>
        </Button>
      </header>

      <figure className="mt-5">
        {isAudio && replication.url ? (
          <Surface
            variant="card"
            padding="lg"
            radius="xl"
            className="flex flex-col gap-4"
          >
            <span
              aria-hidden
              className="flex h-16 items-end justify-center gap-[3px]"
            >
              {audioWaveformBars(replication.slug || replication.title, 48).map(
                (height, index) => (
                  <span
                    key={index}
                    className="theme-replication-waveform-bar w-[3px] rounded-full"
                    style={{ height: `${height}%` }}
                  />
                ),
              )}
            </span>
            <AudioReplicationPlayer
              src={replication.url}
              label={replication.title}
            />
          </Surface>
        ) : previewSource ? (
          // A sighted-user shortcut to the same viewer the header button
          // opens: hidden from the accessibility tree so the button stays the
          // single named route, and the play badge replaces the old "playback
          // opens in the shared viewer" caption.
          <Link
            href={viewerHref}
            aria-hidden
            tabIndex={-1}
            className="theme-media-thumbnail-border group relative block overflow-hidden rounded-2xl border bg-black"
          >
            <AppImage
              src={previewSource}
              alt={replication.title}
              width={replication.width ?? 1600}
              height={replication.height ?? 900}
              priority
              sizes="(max-width: 768px) 100vw, 960px"
              className="max-h-[70vh] w-full object-contain"
            />
            {isVideo || isGif ? (
              <span className="theme-media-tile-title absolute inset-0 grid place-items-center">
                <span className="grid size-14 place-items-center rounded-full bg-black/60 backdrop-blur-sm transition-opacity group-hover:opacity-85 motion-reduce:transition-none">
                  <Icon
                    icon="lucide:play"
                    size={24}
                    className="fill-current"
                    aria-hidden
                  />
                </span>
              </span>
            ) : null}
          </Link>
        ) : (
          <MediaPlaceholder
            kind="empty"
            title={t("Preview unavailable")}
            description={t("Open the viewer to load the original media.")}
            className="aspect-video"
          />
        )}

        {/* The file's vital signs read as the preview's caption. */}
        <figcaption className="theme-text-faint mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <PublicPill
            icon={
              isVideo
                ? "lucide:video"
                : isAudio
                  ? "lucide:audio-lines"
                  : "lucide:image"
            }
            size="sm"
          >
            {isVideo ? t("Video") : isAudio ? t("Audio") : t("Image")}
          </PublicPill>
          {replication.width && replication.height ? (
            <span className="tabular-nums">
              {replication.width} × {replication.height}
            </span>
          ) : null}
          {replication.format ? (
            <span className="uppercase">{replication.format}</span>
          ) : null}
          {duration ? <span className="tabular-nums">{duration}</span> : null}
          {fileSize ? <span className="tabular-nums">{fileSize}</span> : null}
          <a
            href={replication.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${proseLinkClassName} ml-auto`}
          >
            {isAudio ? t("Open audio file") : t("Open full size")}
          </a>
        </figcaption>
      </figure>

      {/* What the work depicts: the effect is its subject, the categories are
          wayfinding into the taxonomy. */}
      {effectName && effectSlug ? (
        <section className="mt-6" aria-labelledby="replication-subject">
          <PublicOverline as="h2" id="replication-subject">
            {t("Replicates")}
          </PublicOverline>

          <p className="mt-2">
            <Link
              href={publicHref.effect(effectSlug)}
              className="theme-accent-heading font-display text-xl font-semibold tracking-tight transition-colors hover:text-dose-accent-strong theme-focus-ring"
            >
              {effectName}
            </Link>
          </p>

          {effectCategories.length > 0 ? (
            <ul
              aria-label={t("{{name}} categories", { name: effectName })}
              className="mt-3 flex flex-wrap gap-2"
            >
              {effectCategories.map((category) => (
                <li key={category.slug}>
                  <PublicNameChip
                    as={Link}
                    href={publicHref.effectCategory(category.slug)}
                    icon={category.icon}
                    interactive
                  >
                    {category.name}
                  </PublicNameChip>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Provenance and the terms the work may be reused under. */}
      <ContentCard className="mt-6">
        <h2 className="theme-accent-heading font-display text-lg font-semibold tracking-tight">
          {t("Credit & licence")}
        </h2>

        <DefinitionList className="mt-3 divide-y divide-dose-border">
          {identityAttribution ? (
            <DefinitionRow
              semantic
              term={t("Posted by")}
              termClassName={termClassName}
              bodyClassName={bodyClassName}
            >
              {identityAttribution.poster.profile_url ? (
                <a
                  href={identityAttribution.poster.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={proseLinkClassName}
                >
                  {identityAttribution.poster.display_name}
                </a>
              ) : (
                identityAttribution.poster.display_name
              )}
              {identityAttribution.poster.platform ? (
                <>
                  {" "}
                  {t("on {{platform}}", {
                    platform: identityAttribution.poster.platform,
                  })}
                </>
              ) : null}
            </DefinitionRow>
          ) : null}

          {/* A separate creator row is an exceptional evidence-backed claim.
              Unresolved reviews collapse to poster-as-creator upstream and
              therefore cannot imply that this post is a repost. */}
          {identityAttribution?.proven_different_creator ? (
            <DefinitionRow
              semantic
              term={t("Creator")}
              termClassName={termClassName}
              bodyClassName={bodyClassName}
            >
              {artistProfileHref ? (
                <Link href={artistProfileHref} className={proseLinkClassName}>
                  {identityAttribution.creator.display_name}
                </Link>
              ) : (
                identityAttribution.creator.display_name
              )}
            </DefinitionRow>
          ) : null}

          {/* The rights holder is a legal claim rather than a byline, so it
              keeps its own row when the record carries one. */}
          {replication.rightsholder ? (
            <DefinitionRow
              semantic
              term={t("Rights holder")}
              termClassName={termClassName}
              bodyClassName={bodyClassName}
            >
              {replication.rightsholder}
            </DefinitionRow>
          ) : null}

          <DefinitionRow
            semantic
            term={t("Licence")}
            termClassName={termClassName}
            bodyClassName={bodyClassName}
          >
            {replication.license_name ? (
              replication.license_url ? (
                <a
                  href={replication.license_url}
                  target="_blank"
                  rel="license noopener noreferrer"
                  className={proseLinkClassName}
                >
                  {replication.license_name}
                </a>
              ) : (
                replication.license_name
              )
            ) : (
              getRightsSummary(replication, t)
            )}
            {replication.permission_notes ? (
              <span className="theme-text-faint block mt-1">
                {replication.permission_notes}
              </span>
            ) : null}
          </DefinitionRow>

          {sourceUrl ? (
            <DefinitionRow
              semantic
              term={t("Source")}
              termClassName={termClassName}
              bodyClassName="text-sm leading-6"
            >
              {/* The host names the provenance; the raw URL stays in the
                  href rather than wrapping across the row as noise. */}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={proseLinkClassName}
              >
                {new URL(sourceUrl).hostname}
              </a>
            </DefinitionRow>
          ) : null}
        </DefinitionList>

        {/* Pre-composed so a reuser satisfies a real licence by copying one
            line. Absent when nothing is licensed — the licence row above is
            the rights posture's one home. */}
        {attribution ? (
          <NestedContentCard className="mt-4">
            <p className="theme-text-faint text-xs uppercase tracking-[0.18em]">
              {t("Attribution")}
            </p>
            <p className="theme-text-secondary mt-2 select-all text-sm leading-6">
              {attribution}
            </p>
          </NestedContentCard>
        ) : null}

        <p className="theme-text-faint mt-4 text-xs leading-5">
          {correctionBefore}
          <Link
            href="/docs/license#replication-media-terms"
            className={proseLinkClassName}
          >
            {t("licensing terms")}
          </Link>
          {correctionAfter}
        </p>
      </ContentCard>
    </PublicContentShell>
  );
}
