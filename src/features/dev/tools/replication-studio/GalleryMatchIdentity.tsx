"use client";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditorStatusPill } from "@/features/dev/components";

import { ReplicationThumb } from "./ReplicationThumb";
import type { GalleryMatch } from "./substanceGalleryPortalModel";

/** Short token labels; the sentence-length copy stays in the public credit block. */
const RIGHTS_TOKEN_LABELS: Record<string, string> = {
  "creator-retained": "creator retained",
  "explicit-license": "licensed",
  "permission-granted": "permission granted",
  "public-domain": "public domain",
  unknown: "rights unknown",
};
/** Explain why the automatic policy or a direct edit placed this row here. */
function ProvenanceChip({ match }: { match: GalleryMatch }) {
  const { provenance } = match;
  const specific = provenance.matchedVia === "specific_drug";
  const classPlacement = provenance.matchedVia === "drug_class";
  const visualFallback = provenance.matchedVia === "visual_disconnection";
  const label = specific
    ? "specific drug"
    : classPlacement
      ? provenance.drugClass
      : visualFallback
        ? "visual disconnection"
        : "manual association";
  const explanation = specific
    ? "The replication names exactly this drug and no combination, so it appears only on this article."
    : classPlacement
      ? `The replication names ${provenance.drugClass} generally and no specific drug, so it appears on every article in that class.`
      : visualFallback
        ? "An eligible Visual Disconnection still appears on every dissociative article, after every other placement."
        : "An editor associated this row directly. Manual associations follow the exact-drug and class-general tiers.";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="auto"
          aria-label={`${label}: ${provenance.matchedVia}`}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-[color:var(--editor-chip-border)] bg-[var(--editor-chip-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--editor-chip-text)]"
        >
          <Icon
            icon={
              specific
                ? "lucide:pill"
                : classPlacement
                  ? "lucide:shapes"
                  : visualFallback
                    ? "lucide:image"
                    : "lucide:link"
            }
            size={11}
            className="shrink-0"
          />
          <span className="min-w-0 truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs" align="start">
        <p className="theme-text-primary font-medium">{label}</p>
        <p className="theme-text-muted mt-1">{explanation}</p>
      </PopoverContent>
    </Popover>
  );
}

function RightsToken({ match }: { match: GalleryMatch }) {
  const status = match.replication.rights_status ?? "creator-retained";
  const unknown = status === "unknown";
  return (
    <EditorStatusPill
      tone={unknown ? "warning" : "neutral"}
      className="shrink-0"
      title={unknown ? "Reuse terms are unknown; check before featuring this prominently." : undefined}
    >
      {RIGHTS_TOKEN_LABELS[status] ?? status}
    </EditorStatusPill>
  );
}

/** Thumb + title + artist + provenance + rights: the identity block of every row. */
export function GalleryMatchIdentity({ match }: { match: GalleryMatch }) {
  const { replication } = match;
  return (
    <>
      <ReplicationThumb row={replication} className="h-14 w-14 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="theme-text-primary truncate text-sm font-medium">{replication.title}</p>
        <p className="theme-text-faint truncate text-xs">
          {replication.artist} · {replication.type}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <ProvenanceChip match={match} />
          <RightsToken match={match} />
        </div>
      </div>
    </>
  );
}
