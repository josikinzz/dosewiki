"use client";

import { useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { ArticleChangeDiff } from "@/features/article/editing/ArticleChangeDiff";
import { Notice } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";

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
}

/**
 * The notice a stale article opens with: it was published after its sign-off,
 * and one click shows only the fields that changed since the signed revision,
 * so re-review reads a diff instead of the whole article.
 */
export function ReviewChangesSinceReview({ slug, name, reviewedRevision, reviewedBy }: ReviewChangesSinceReviewProps) {
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
    <Surface asChild variant="card" padding="none" radius="xl" className="overflow-hidden">
      <section aria-label="Changed since review">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <Icon icon="lucide:git-compare" size={15} className="theme-text-secondary shrink-0" />
          <p className="theme-text-primary min-w-0 flex-1 text-sm">
            <span className="font-semibold">Changed since review.</span>{" "}
            {name} was published after {reviewedBy ? `${reviewedBy} signed it off` : "its sign-off"}.
            Mark it reviewed again once the changes are checked.
          </p>
          <Button
            type="button"
            variant={open ? "pillActive" : "pill"}
            size="pill"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={PANEL_ID}
          >
            {open ? "Hide changes since review" : "Show changes since review"}
          </Button>
        </div>
        {open ? (
          <div id={PANEL_ID} className="border-t border-dose-border p-4">
            {loading ? <p role="status" className="theme-text-muted text-sm">Loading the changes since review…</p> : null}
            {error ? <Notice tone="danger" message={error} /> : null}
            {changes ? <ArticleChangeDiff before={changes.signed} after={changes.current} /> : null}
          </div>
        ) : null}
      </section>
    </Surface>
  );
}
