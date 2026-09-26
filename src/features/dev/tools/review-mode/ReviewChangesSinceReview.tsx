"use client";

import { useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { ArticleChangeDiff, articleFieldChanges } from "@/features/article/editing/ArticleChangeDiff";
import { countChanges, safetyChanges } from "@/features/article/editing/articleSessionModel";
import { LoadErrorState, Notice } from "@/features/dev/components";
import { RelativeDay } from "@/features/dev/tools/home/homeParts";
import type { SubstanceArticle } from "@/schema";

import { signOffCredit } from "./reviewQueue";

const PANEL_ID = "review-changes-since-review";

interface ReviewChanges {
  signed: SubstanceArticle;
  current: SubstanceArticle;
}

export interface ReviewChangesSinceReviewProps {
  slug: string;
  name: string;
  /** The published revision the stale sign-off covered. */
  reviewedRevision: string;
  reviewedBy?: string;
  /** When that sign-off was made. */
  reviewedAt?: string;
  /** The editor whose recommendation the sign-off approved, if any. */
  recommendedBy?: string;
}

/**
 * The notice a stale article opens with: it changed after its sign-off, and
 * one press shows only the fields that changed since the signed revision, so
 * re-review reads a diff instead of the whole article.
 */
export function ReviewChangesSinceReview({ slug, name, reviewedRevision, reviewedBy, reviewedAt, recommendedBy }: ReviewChangesSinceReviewProps) {
  const credit = signOffCredit({ reviewedBy, recommendedBy });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [changes, setChanges] = useState<ReviewChanges | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ slug, since: reviewedRevision });
      const response = await fetch(`/api/dev/review-revisions?${params.toString()}`);
      const payload = (await response.json().catch(() => null)) as
        | (Partial<ReviewChanges> & { error?: string })
        | null;
      if (!response.ok || !payload?.signed || !payload.current) {
        throw new Error(payload?.error ?? "Unable to load the changes since review.");
      }
      setChanges({ signed: payload.signed, current: payload.current });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the changes since review.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !changes && !loading) void load();
  };

  return (
    <section aria-label="Changed since review" className="theme-review-stale-notice rounded-card border">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-3">
          <Icon icon="lucide:git-compare" size={16} className="theme-text-secondary mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-0.5 text-sm">
            <p className="theme-text-primary">
              <span className="font-semibold">Changed since review.</span>{" "}
              {name} changed after its sign-off{credit ? ` (${credit})` : ""}.
            </p>
            <p className="theme-text-muted">
              {reviewedAt ? <>Signed off <RelativeDay iso={reviewedAt} />. </> : null}
              Check what changed, then mark it reviewed again.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 self-start sm:self-auto"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={PANEL_ID}
        >
          {open ? "Hide changes since review" : "Show changes since review"}
          <ExpandIndicator isExpanded={open} />
        </Button>
      </div>
      <div id={PANEL_ID} hidden={!open} className="border-t border-dose-border p-4">
        {loading ? (
          <p role="status" className="theme-text-muted flex items-center gap-2 text-sm">
            <Icon icon="lucide:loader-circle" size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
            Loading the changes since review
          </p>
        ) : null}
        {error ? <LoadErrorState what="the changes since review" message={error} onRetry={() => void load()} /> : null}
        {changes ? <ChangesSinceSignOff signed={changes.signed} current={changes.current} /> : null}
      </div>
    </section>
  );
}

/**
 * What changed since the sign-off: the count, then any dose, duration or
 * interaction change first in a warning lead (readers dose and combine by
 * these), then every changed field with its changed words marked.
 */
function ChangesSinceSignOff({ signed, current }: ReviewChanges) {
  const all = articleFieldChanges(signed, current);
  const safety = safetyChanges(all);
  return (
    <div className="space-y-4">
      <p className="theme-text-muted text-sm">
        {all.length === 0 ? "No article fields changed; only the molecule or a stored detail moved." : `${countChanges(all.length)} since the sign-off.`}
      </p>
      {safety.length > 0 ? (
        <Notice
          tone="warning"
          title={safety.length === 1 ? "A dose, duration or interaction changed" : `${safety.length} dose, duration and interaction changes`}
          message={<>Readers dose and combine by these values. Check each before and after, including the unit.<div className="mt-3"><ArticleChangeDiff changes={safety} /></div></>}
          className="text-sm"
        />
      ) : null}
      <ArticleChangeDiff before={signed} after={current} />
    </div>
  );
}
