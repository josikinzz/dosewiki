"use client";

import { useEffect, useRef, useState } from "react";

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
  reviewedRevision: string;
  reviewedBy?: string;
  reviewedAt?: string;
  recommendedBy?: string;
  openSignal?: number;
  onOpened?: () => void;
}

export function ReviewChangesSinceReview({ slug, name, reviewedRevision, reviewedBy, reviewedAt, recommendedBy, openSignal = 0, onOpened }: ReviewChangesSinceReviewProps) {
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
    if (next) onOpened?.();
    if (next && !changes && !loading) void load();
  };

  const sectionRef = useRef<HTMLElement>(null);
  const handledSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal === handledSignal.current) return;
    handledSignal.current = openSignal;
    setOpen(true);
    onOpened?.();
    if (!changes && !loading) void load();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
    sectionRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Changed since review"
      className="theme-review-stale-notice rounded-card border scroll-mt-[calc(var(--review-bar-height,3.5rem)+1rem)] outline-none"
    >
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
