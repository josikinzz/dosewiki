import Link from "next/link";

import { AppImage } from "@/components/common/AppImage";
import { DefinitionList, DefinitionRow } from "@/components/common/DefinitionList";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PublicOverline, PublicPill } from "@/components/common/PublicTokens";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { ContentCard, NestedContentCard } from "@/components/ui/surface";
import { publicHref } from "@/utils/publicHref";
import type { ReplicationWithUrl } from "@/types/replications";
import {
  getExternalSourceUrl,
  getRightsSummary,
  hasKnownCreator,
} from "../components/replicationCredit";
import type { ReplicationNeighbors } from "../gallery/replicationDetailModel";
import { ReplicationNeighborKeys } from "./ReplicationNeighborKeys";
import { buildAttributionLine } from "./replicationAttribution";

export interface ReplicationDetailPageProps {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  neighbors: ReplicationNeighbors;
}

const FALLBACK_RATIO = 4 / 3;

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
 * One replication, addressable. The image is the page's subject, so nothing is
 * drawn on top of it — title and credit sit above, provenance and licensing
 * below. That split is what makes the licence legible at the moment someone
 * arrives from a shared link, which is the whole point of the permalink.
 */
export function ReplicationDetailPage({
  replication,
  effectName,
  effectSlug,
  neighbors,
}: ReplicationDetailPageProps) {
  const isVideo = replication.type === "video";
  const creator = hasKnownCreator(replication.artist) ? replication.artist.trim() : null;
  const sourceUrl = getExternalSourceUrl(replication);
  const attribution = buildAttributionLine(replication);

  const width = replication.width ?? 1600;
  const height = replication.height ?? Math.round(width / FALLBACK_RATIO);

  const fileSize = formatFileSize(replication.file_size);
  const duration = formatDuration(replication.duration);

  return (
    <PublicContentShell width="standard" focusTarget>
      <ReplicationNeighborKeys
        previousHref={neighbors.previous ? publicHref.replication(neighbors.previous.slug) : null}
        nextHref={neighbors.next ? publicHref.replication(neighbors.next.slug) : null}
      />

      {/* Above the image: where you are, what this is, who made it. */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PublicOverline as={Link} href={publicHref.replications()} className={proseLinkClassName}>
            Replications
          </PublicOverline>
          {effectName && effectSlug ? (
            <>
              <span className="theme-text-ghost text-[0.6875rem]" aria-hidden>
                /
              </span>
              <PublicOverline as={Link} href={publicHref.effect(effectSlug)} className={proseLinkClassName}>
                {effectName}
              </PublicOverline>
            </>
          ) : null}
        </div>

        <h1 className="theme-accent-heading font-display text-[1.75rem] font-bold tracking-tight sm:text-[2.125rem]">
          {replication.title}
        </h1>

        <p className="theme-text-secondary text-sm leading-6">
          {creator ? (
            <>
              by{" "}
              {replication.artist_url ? (
                <a
                  href={replication.artist_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={proseLinkClassName}
                >
                  {creator}
                </a>
              ) : (
                <span className="theme-text-primary font-medium">{creator}</span>
              )}
            </>
          ) : (
            <span className="theme-text-muted">Creator unknown</span>
          )}
        </p>
      </header>

      {/* The work itself. No overlay, no caption burned into the frame. */}
      <figure className="mt-6">
        <div className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-subtle)] bg-[var(--theme-surface-strong)]">
          {isVideo ? (
            // No caption track: replications are wordless visual recreations and
            // the schema carries no caption asset to point at. Muting the player
            // would satisfy the rule but would misrepresent the work.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={replication.url}
              poster={replication.thumbnail_url}
              controls
              playsInline
              preload="metadata"
              className="mx-auto block max-h-[72vh] w-full bg-black/20 object-contain"
            />
          ) : (
            <AppImage
              src={replication.url}
              alt={replication.title}
              width={width}
              height={height}
              priority
              sizes="(min-width: 1024px) 56rem, 100vw"
              className="mx-auto block max-h-[72vh] w-auto max-w-full object-contain"
            />
          )}
        </div>

        <figcaption className="theme-text-faint mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <PublicPill icon={isVideo ? "lucide:video" : "lucide:image"} size="sm">
            {isVideo ? "Video" : "Image"}
          </PublicPill>
          {replication.width && replication.height ? (
            <span className="tabular-nums">
              {replication.width} × {replication.height}
            </span>
          ) : null}
          {replication.format ? <span className="uppercase">{replication.format}</span> : null}
          {duration ? <span className="tabular-nums">{duration}</span> : null}
          {fileSize ? <span className="tabular-nums">{fileSize}</span> : null}
          <a
            href={replication.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${proseLinkClassName} ml-auto`}
          >
            Open full size
          </a>
        </figcaption>
      </figure>

      {/* Below the image: provenance and the terms you may reuse it under. */}
      <ContentCard className="mt-8">
        <h2 className="theme-accent-heading font-display text-lg font-semibold tracking-tight">
          Credit &amp; licence
        </h2>

        <DefinitionList className="mt-4 divide-y divide-[color:var(--theme-border-subtle)]">
          <DefinitionRow
            semantic
            term="Creator"
            termClassName="theme-text-faint text-xs uppercase tracking-[0.18em]"
            bodyClassName="theme-text-secondary text-sm leading-6"
          >
            {creator ?? "Unknown"}
            {replication.rightsholder && replication.rightsholder !== creator ? (
              <span className="theme-text-faint"> · rights held by {replication.rightsholder}</span>
            ) : null}
          </DefinitionRow>

          <DefinitionRow
            semantic
            term="Licence"
            termClassName="theme-text-faint text-xs uppercase tracking-[0.18em]"
            bodyClassName="theme-text-secondary text-sm leading-6"
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
              getRightsSummary(replication)
            )}
            {replication.permission_notes ? (
              <span className="theme-text-faint block mt-1">{replication.permission_notes}</span>
            ) : null}
          </DefinitionRow>

          {effectName && effectSlug ? (
            <DefinitionRow
              semantic
              term="Replicates"
              termClassName="theme-text-faint text-xs uppercase tracking-[0.18em]"
              bodyClassName="text-sm leading-6"
            >
              <Link href={publicHref.effect(effectSlug)} className={proseLinkClassName}>
                {effectName}
              </Link>
            </DefinitionRow>
          ) : null}

          {sourceUrl ? (
            <DefinitionRow
              semantic
              term="Source"
              termClassName="theme-text-faint text-xs uppercase tracking-[0.18em]"
              bodyClassName="text-sm leading-6 break-words"
            >
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={proseLinkClassName}
              >
                {sourceUrl}
              </a>
            </DefinitionRow>
          ) : null}
        </DefinitionList>

        {/* Pre-composed so a reuser can satisfy the attribution requirement by
            copying one line rather than assembling it from the rows above. */}
        <NestedContentCard className="mt-5">
          <p className="theme-text-faint text-xs uppercase tracking-[0.18em]">Attribution</p>
          <p className="theme-text-secondary mt-2 select-all text-sm leading-6">{attribution}</p>
        </NestedContentCard>

        <p className="theme-text-ghost mt-4 text-xs leading-5">
          To correct a credit or request removal, see the{" "}
          <Link href="/docs/license#replication-media-terms" className={proseLinkClassName}>
            licensing terms
          </Link>
          .
        </p>
      </ContentCard>

      {neighbors.total > 1 ? (
        <nav
          aria-label={effectName ? `More replications of ${effectName}` : "More replications"}
          className="mt-8 border-t border-[color:var(--theme-border-subtle)] pt-4"
        >
          <div className="flex items-stretch justify-between gap-3">
            <NeighborLink neighbor={neighbors.previous} direction="previous" />
            <p className="theme-text-ghost self-center whitespace-nowrap text-xs tabular-nums">
              {neighbors.position} / {neighbors.total}
            </p>
            <NeighborLink neighbor={neighbors.next} direction="next" />
          </div>
        </nav>
      ) : null}
    </PublicContentShell>
  );
}

function NeighborLink({
  neighbor,
  direction,
}: {
  neighbor: ReplicationNeighbors["previous"];
  direction: "previous" | "next";
}) {
  const isNext = direction === "next";

  if (!neighbor) {
    // Hold the column so the counter stays centred at the end of a run.
    return <span className="min-w-0 flex-1" aria-hidden />;
  }

  return (
    <Link
      href={publicHref.replication(neighbor.slug)}
      rel={isNext ? "next" : "prev"}
      className={[
        "group theme-text-muted flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors",
        "hover:text-[var(--theme-accent-strong)] hover:bg-[var(--theme-frosted-control-hover-bg)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]",
        isNext ? "flex-row-reverse text-right" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon
        icon={isNext ? "lucide:arrow-right" : "lucide:arrow-left"}
        className={[
          "h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
          // Nudge outward in the direction of travel.
          isNext ? "group-hover:translate-x-0.5" : "group-hover:-translate-x-0.5",
        ].join(" ")}
      />
      {neighbor.thumbnailUrl ? (
        <AppImage
          src={neighbor.thumbnailUrl}
          alt=""
          width={48}
          height={48}
          className="h-10 w-10 shrink-0 rounded-lg border border-[color:var(--theme-border-subtle)] object-cover"
        />
      ) : null}
      <span className="min-w-0">
        <span className="theme-text-ghost block text-[0.6875rem] uppercase tracking-[0.18em]">
          {isNext ? "Next" : "Previous"}
        </span>
        <span className="block truncate">{neighbor.title}</span>
      </span>
    </Link>
  );
}
