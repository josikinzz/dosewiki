"use client";

import { Icon } from "@/components/common/Icon";
import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { languageLabel, type GlossaryList } from "./glossaryModel";
import styles from "./TranslationProgress.module.css";

export function TranslationProgress({ data, starting, error, onRefresh, onRetryExhausted, retryDisabled = false }: {
  data: GlossaryList; starting: boolean; error: string | null; onRefresh: () => void;
  /** Offered to admins once a run has settled with pages that stopped after repeated failures. */
  onRetryExhausted?: () => void; retryDisabled?: boolean;
}) {
  const { jobs } = data;
  if (!jobs.total && !starting) return null;
  const issues = jobs.completedWithRejections + jobs.exhausted;
  const settled = Math.min(jobs.total, jobs.completed + jobs.exhausted);
  const percent = jobs.total ? Math.round(settled / jobs.total * 100) : 0;
  const remaining = Math.max(0, jobs.total - settled);
  const running = starting || jobs.active > 0;
  const clean = Math.max(0, jobs.completed - jobs.completedWithRejections);
  const title = starting ? "Preparing your translation" : running ? "Translation in progress" : issues ? "Translation finished with items to review" : "Latest run complete";
  const number = (value: number) => value.toLocaleString();
  return (
    <Surface variant="subtle" padding="md" className="space-y-4" aria-label={`${languageLabel(data.locale)} translation progress`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="theme-text-faint text-xs uppercase tracking-widest">{data.locale} · Latest translation run</p>
          <h3 className="flex items-center gap-2 text-base font-semibold" aria-live="polite">
            <span key={running ? "working" : "finished"} className={!running && !issues ? styles.complete : ""}>
              <Icon icon={running ? "lucide:languages" : issues ? "lucide:circle-alert" : "lucide:check-check"} size={20} />
            </span>{title}
          </h3>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <strong className="theme-text-primary block text-3xl leading-none tracking-tight">{starting ? "…" : `${percent}%`}</strong>
          {!starting ? <span className="theme-text-faint text-[0.6875rem]">of this run</span> : null}
        </div>
      </div>
      {!starting ? <div className="flex items-baseline justify-between gap-3 text-xs tabular-nums">
        <strong className="theme-text-primary">{number(settled)} of {number(jobs.total)} processed</strong>
        <span className="theme-text-muted">{number(remaining)} remaining</span>
      </div> : null}
      <div role="progressbar" aria-label="Pages processed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={starting ? undefined : percent}
        aria-valuetext={`${number(settled)} of ${number(jobs.total)} pages processed; ${number(issues)} need attention`} className={styles.track}>
        <div className={`${styles.fill} ${running && !error ? styles.moving : ""}`} style={{ width: starting ? "12%" : `${jobs.total ? clean / jobs.total * 100 : 0}%` }} />
        <div className={styles.attention} style={{ width: `${jobs.total ? issues / jobs.total * 100 : 0}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm tabular-nums">
        <div><strong className="theme-accent-emphasis">{number(clean)}</strong><p className="theme-text-faint text-xs">Clean</p></div>
        <div><strong>{number(remaining)}</strong><p className="theme-text-faint text-xs">Remaining</p></div>
        <div><strong className={issues ? "text-[color:var(--theme-warning-text)]" : undefined}>{number(issues)}</strong><p className="theme-text-faint text-xs">Need attention</p></div>
      </div>
      <p className="theme-text-muted text-xs">
        {starting ? "Gathering public pages and saving the run. This may take a moment." : running
          ? `${number(jobs.inFlight ?? 0)} pages being worked on${jobs.retrying ? ` · ${number(jobs.retrying)} retrying` : ""}. Progress refreshes every 5 seconds. You can close this page; translation continues on the server.`
          : "This run is saved. This is the latest saved run, not whole-site coverage; Coverage in Articles shows the whole site."}
      </p>
      <p className="theme-text-faint text-[0.6875rem] tabular-nums">Updated {new Date(data.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>
      {issues > 0 && <p className="text-xs text-[color:var(--theme-warning-text)]">{number(jobs.completedWithRejections)} pages contain segments that failed validation and retain their previous wording or fall back to English. {jobs.exhausted > 0 ? `${number(jobs.exhausted)} pages stopped after repeated failures. ` : ""}Saved translations are preserved. Review these results before running translation again.</p>}
      {!running && jobs.exhausted > 0 && onRetryExhausted ? <Button variant="outline" size="sm" disabled={retryDisabled} onClick={onRetryExhausted}>
        <Icon icon="lucide:rotate-ccw" size={14} />Retry {number(jobs.exhausted)} failed {jobs.exhausted === 1 ? "page" : "pages"}
      </Button> : null}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--theme-warning-text)]"><span>Progress refresh failed. Showing the last saved counts. {error}</span><Button variant="outline" size="sm" onClick={onRefresh}>Retry refresh</Button></div>}
    </Surface>
  );
}
