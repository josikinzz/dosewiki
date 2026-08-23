import Link from "next/link";

import {
  DefinitionList,
  DefinitionRow,
} from "@/components/common/DefinitionList";
import { proseLinkClassName } from "@/components/common/ProseLink";
import {
  PublicNameChip,
  PublicOverline,
  PublicPill,
} from "@/components/common/PublicTokens";
import { ContentCard, NestedContentCard } from "@/components/ui/surface";
import {
  getExternalSourceUrl,
  getRightsSummary,
} from "@/features/effects/components/replicationCredit";
import { buildAttributionLine } from "@/features/effects/pages/replicationAttribution";
import { publicHref } from "@/utils/publicHref";
import type { ReplicationViewerItem } from "./viewerModel";

/**
 * Stable provenance and reuse metadata for a single replication. The detail
 * page renders this below its non-playing preview; the expanded viewer keeps
 * the same facts in its on-demand information panel.

 */
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

export function ViewerMetadata({ item }: { item: ReplicationViewerItem }) {
  const { replication, effectName, effectSlug, effectCategories } = item;
  const isVideo = replication.type === "video";
  const sourceUrl = getExternalSourceUrl(replication);
  const attribution = buildAttributionLine(replication);
  const fileSize = formatFileSize(replication.file_size);
  const duration = formatDuration(replication.duration);

  return (
    <>
      {/* The file's vital signs, kept adjacent to the work they describe. */}
      <div className="theme-text-faint flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <PublicPill icon={isVideo ? "lucide:video" : "lucide:image"} size="sm">
          {isVideo ? "Video" : "Image"}
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
          Open full size
        </a>
      </div>

      {/* What the reader is looking at, directly under the work.
          This used to be a "Replicates" row inside Credit & licence, which
          answers a different question: that card is about provenance and reuse
          terms, while the effect is the work's subject and the categories are
          wayfinding into the taxonomy. Someone who has just looked at the image
          asks "what is this an effect of, and what else is like it" before they
          ask who holds the rights, so it belongs against the image rather than
          buried in a rights table — and it is not repeated in both places. */}
      {effectName && effectSlug ? (
        <section className="mt-6" aria-labelledby="replication-subject">
          <PublicOverline as="h2" id="replication-subject">
            Replicates
          </PublicOverline>

          <p className="mt-2">
            <Link
              href={publicHref.effect(effectSlug)}
              className="theme-accent-heading font-display text-xl font-semibold tracking-tight transition-colors hover:text-dose-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"
            >
              {effectName}
            </Link>
          </p>

          {effectCategories.length > 0 ? (
            <ul
              aria-label={`${effectName} categories`}
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

      {/* Below the image: provenance and the terms you may reuse it under. */}
      <ContentCard className="mt-8">
        <h2 className="theme-accent-heading font-display text-lg font-semibold tracking-tight">
          Credit &amp; licence
        </h2>

        <DefinitionList className="mt-4 divide-y divide-dose-border">
          {/* No Creator row: the compact top line above the fold already names
              the artist, once. The rights holder is a legal claim rather than
              a byline, so it keeps its own row when the record carries one. */}
          {replication.rightsholder ? (
            <DefinitionRow
              semantic
              term="Rights holder"
              termClassName="theme-text-faint text-xs uppercase tracking-[0.18em]"
              bodyClassName="theme-text-secondary text-sm leading-6"
            >
              {replication.rightsholder}
            </DefinitionRow>
          ) : null}

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
              <span className="theme-text-faint block mt-1">
                {replication.permission_notes}
              </span>
            ) : null}
          </DefinitionRow>

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
          <p className="theme-text-faint text-xs uppercase tracking-[0.18em]">
            Attribution
          </p>
          <p className="theme-text-secondary mt-2 select-all text-sm leading-6">
            {attribution}
          </p>
        </NestedContentCard>

        <p className="theme-text-faint mt-4 text-xs leading-5">
          To correct a credit or request removal, see the{" "}
          <Link
            href="/docs/license#replication-media-terms"
            className={proseLinkClassName}
          >
            licensing terms
          </Link>
          .
        </p>
      </ContentCard>
    </>
  );
}
