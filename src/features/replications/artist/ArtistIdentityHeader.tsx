"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { focusRingClassName } from "@/components/ui/surface";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { artistLinkPresentation, formatArtistWorksLine } from "./artistPageModel";
import { APPROVED_REPLICATOR_LABEL, VERIFIED_REPLICATOR_LABEL } from "../replicationVocabulary";

export interface ArtistIdentityHeaderProps {
  name: string;
  /** Back to the gallery's artist browsing. */
  browseAllHref: string;
  /**
   * False for the Unattributed bucket, which carries no identity claim by
   * design: no avatar frame, just the heading and counts.
   */
  attributed: boolean;
  avatarUrl?: string | null;
  verifiedReplicator?: boolean;
  /** dose.wiki's endorsement of the artist; the index's star, spelled out. */
  approvedReplicator?: boolean;
  role?: string | null;
  /** Already-rendered bio markdown; null renders no prose. */
  bio?: ReactNode;
  /** Profile links plus the folded-in legacy own-site URL. */
  links: readonly { label: string; url: string }[];
  counts: { count: number; imageCount: number; videoCount: number };
}

/**
 * The Artist Page's identity header: the avatar at portrait scale, the name in
 * display type, one quiet role-and-counts line, the bio, and every external
 * link as a pill wearing its site's mark. Replaces the old arrangement where
 * the name sat in a small focus heading, the avatar was a 56px afterthought,
 * and links all shared one generic glyph.
 */
export function ArtistIdentityHeader({
  name,
  browseAllHref,
  attributed,
  avatarUrl,
  verifiedReplicator = false,
  approvedReplicator = false,
  role,
  bio,
  links,
  counts,
}: ArtistIdentityHeaderProps) {
  const t = useT();
  const trimmedRole = role?.trim() ?? "";

  return (
    <header
      aria-label={t("About {{name}}", { name })}
      data-testid="artist-identity"
      className="space-y-5"
    >
      <div className="px-1">
        <Link
          href={browseAllHref}
          className={cn(
            "theme-back-link group inline-flex min-h-11 items-center gap-1 rounded-full text-sm font-medium",
            "transition-colors motion-reduce:transition-none",
            focusRingClassName,
          )}
        >
          <Icon
            icon="lucide:arrow-left"
            className="h-4 w-4 transition group-hover:-translate-x-0.5 motion-reduce:transition-none"
          />
          {t("All artists")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-4 px-1 sm:gap-x-6">
        {attributed ? (
          <ContributorAvatar
            imageUrl={avatarUrl}
            name={name}
            size="md"
            lifted
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="theme-accent-heading font-display break-words text-3xl font-bold tracking-tight sm:text-4xl">
            {name}
          </h1>
          <p className="theme-text-muted mt-1.5 text-sm font-medium tabular-nums">
            {trimmedRole ? (
              <>
                <span data-testid="contributor-role">{trimmedRole}</span>
                {/* Real spaces rather than padding, so the copied and
                    screen-read text separates the two the same way. */}
                <span aria-hidden="true" className="opacity-60">
                  {" · "}
                </span>
              </>
            ) : null}
            {formatArtistWorksLine(counts, t)}
          </p>
          {approvedReplicator || verifiedReplicator ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {approvedReplicator ? (
                <PublicPill
                  tone="accent"
                  icon="lucide:star"
                  data-testid="approved-replicator-badge"
                >
                  {t(APPROVED_REPLICATOR_LABEL)}
                </PublicPill>
              ) : null}
              {verifiedReplicator ? (
                <PublicPill
                  tone="accent"
                  icon="lucide:badge-check"
                  data-testid="verified-replicator-badge"
                >
                  {t(VERIFIED_REPLICATOR_LABEL)}
                </PublicPill>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {links.length > 0 ? (
        <nav
          aria-label={t("{{name}} links", { name })}
          className="flex flex-wrap gap-2 px-1"
        >
          {links.map((link) => (
            <ArtistLinkPill key={link.url} label={link.label} url={link.url} />
          ))}
        </nav>
      ) : null}

      {bio ? (
        <div className="theme-text-secondary max-w-[72ch] px-1 text-sm">
          {bio}
        </div>
      ) : null}
    </header>
  );
}

/**
 * One external link as a pill carrying its site's mark: a brand glyph for
 * recognizable platforms, a committed favicon where the source corpus has
 * one, the globe otherwise (`artistLinkPresentation`).
 */
function ArtistLinkPill({ label, url }: { label: string; url: string }) {
  const { icon, faviconSrc } = artistLinkPresentation(url);

  return (
    <PublicPill
      as="a"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group min-h-9 gap-2 px-3.5 transition-opacity hover:opacity-90 theme-focus-ring",
      )}
    >
      {faviconSrc ? (
        <AppImage
          src={faviconSrc}
          alt=""
          width={16}
          height={16}
          className="size-4 shrink-0 rounded-[3px]"
        />
      ) : (
        <Icon icon={icon ?? "lucide:globe"} size={14} className="shrink-0 text-current" />
      )}
      <span className="min-w-0 truncate">{label}</span>
      <Icon
        icon="lucide:arrow-up-right"
        size={13}
        className="theme-text-faint shrink-0 transition-opacity group-hover:opacity-80"
      />
    </PublicPill>
  );
}
