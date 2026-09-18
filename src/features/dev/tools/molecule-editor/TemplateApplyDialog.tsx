"use client";

import { Icon } from "@/components/common/Icon";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Surface,
} from "@/components/ui";
import { EditorCheckbox, EditorNotice, EditorStatusPill } from "@/features/dev/components";
import type { TemplateApplyPreviewRow } from "./templateApplicationPayload";
import { summarizeTemplatePreview } from "./templateApplicationPayload";

export type TemplateApplyServerResult = {
  slug: string;
  status: "applied" | "skipped" | "error";
  reason?: string;
};

interface TemplateApplyDialogProps {
  open: boolean;
  classLabel: string;
  rows: TemplateApplyPreviewRow[];
  includedSlugs: ReadonlySet<string>;
  preparing: boolean;
  applying: boolean;
  error: string | null;
  results: TemplateApplyServerResult[] | null;
  onOpenChange: (open: boolean) => void;
  onToggle: (slug: string, included: boolean) => void;
  onConfirm: () => void;
}

function previewStatus(row: TemplateApplyPreviewRow) {
  if (row.outcome === "aligned") {
    return {
      label: row.relaxedBonds ? "aligned · bonds relaxed" : "aligned",
      tone: "success" as const,
      icon: "lucide:check" as const,
    };
  }
  if (row.outcome === "protected-hand-edit") {
    return {
      label: "protected hand edit",
      tone: "warning" as const,
      icon: "lucide:shield" as const,
    };
  }
  if (row.outcome === "no-match") {
    return { label: "no match", tone: "neutral" as const, icon: "lucide:skip-forward" as const };
  }
  return { label: "error", tone: "danger" as const, icon: "lucide:circle-alert" as const };
}

function resultStatus(result: TemplateApplyServerResult | undefined) {
  if (!result) return null;
  if (result.status === "applied") {
    return <EditorStatusPill tone="success" icon="lucide:check">applied</EditorStatusPill>;
  }
  if (result.status === "skipped") {
    return <EditorStatusPill tone="warning" icon="lucide:shield">protected at save</EditorStatusPill>;
  }
  return <EditorStatusPill tone="danger" icon="lucide:circle-alert">apply failed</EditorStatusPill>;
}

function MoleculePreviewFrame({ svg, empty }: { svg?: string | null; empty: string }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-xl border border-dose-border bg-dose-body p-3">
      {svg ? (
        <div
          className="h-32 w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain"
          // RDKit.js output rendered from the guarded current/plan MOL blocks.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span className="theme-text-faint max-w-40 text-center text-xs">{empty}</span>
      )}
    </div>
  );
}

export function TemplateApplyDialog({
  open,
  classLabel,
  rows,
  includedSlugs,
  preparing,
  applying,
  error,
  results,
  onOpenChange,
  onToggle,
  onConfirm,
}: TemplateApplyDialogProps) {
  const summary = summarizeTemplatePreview(rows);
  const resultBySlug = new Map((results ?? []).map((result) => [result.slug, result]));
  const applied = results?.filter((result) => result.status === "applied").length ?? 0;
  const protectedAtSave =
    results?.filter((result) => result.status === "skipped").length ?? 0;
  const applyErrors = results?.filter((result) => result.status === "error").length ?? 0;
  const excluded = Math.max(summary.aligned - includedSlugs.size, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 md:max-w-6xl"
        showClose={false}
      >
        <DialogHeader className="border-b border-dose-border px-6 py-5 pr-14">
          <DialogTitle>Apply {classLabel} template</DialogTitle>
          <DialogDescription className="theme-text-muted">
            Review every rolled class member. Nothing is written until you confirm.
          </DialogDescription>
          {!preparing && rows.length > 0 ? (
            <p className="theme-text-secondary pt-2 text-sm" aria-live="polite">
              {summary.aligned} aligned · {summary.noMatch} no match · {summary.protected} protected
              {summary.errors > 0
                ? ` · ${summary.errors} ${summary.errors === 1 ? "error" : "errors"} (${rows
                    .filter((row) => row.outcome === "error")
                    .map((row) => row.title || row.slug)
                    .join(", ")})`
                : ""}
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {preparing ? (
            <EditorNotice
              notice={{
                tone: "info",
                title: "Building preview",
                message: "Loading current depictions, aligning matches, and rendering before/after pairs…",
                icon: "lucide:loader-2",
                live: true,
              }}
            />
          ) : error ? (
            <EditorNotice
              notice={{ tone: "danger", title: "Couldn't build preview", message: error, live: true }}
            />
          ) : rows.length === 0 ? (
            <EditorNotice
              notice={{
                tone: "warning",
                title: "No eligible members",
                message: "This class has no rolled visible members to preview.",
              }}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {rows.map((row) => {
                const status = previewStatus(row);
                const result = resultBySlug.get(row.slug);
                return (
                  <Surface key={row.slug} variant="muted" padding="sm" radius="lg">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="theme-text-primary truncate font-medium">{row.title}</p>
                        <p className="theme-text-faint truncate font-mono text-xs">{row.slug}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {row.outcome === "aligned" ? (
                          <EditorCheckbox
                            label="Include"
                            containerClassName="min-h-10 items-center"
                            checked={includedSlugs.has(row.slug)}
                            onChange={(event) => onToggle(row.slug, event.target.checked)}
                            disabled={applying || !!results}
                          />
                        ) : null}
                        <EditorStatusPill tone={status.tone} icon={status.icon}>
                          {status.label}
                        </EditorStatusPill>
                        {resultStatus(result)}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <p className="theme-text-faint mb-1.5 text-sm font-medium uppercase tracking-wide">Before</p>
                        <MoleculePreviewFrame svg={row.beforeSvg} empty="Current depiction unavailable" />
                      </div>
                      <div>
                        <p className="theme-text-faint mb-1.5 text-sm font-medium uppercase tracking-wide">After</p>
                        <MoleculePreviewFrame
                          svg={row.afterSvg}
                          empty={
                            row.outcome === "protected-hand-edit"
                              ? "Protected hand edit, not aligned"
                              : row.outcome === "no-match"
                                ? "Template does not match"
                                : row.reason ?? "No aligned preview"
                          }
                        />
                      </div>
                    </div>
                    {result?.reason ? (
                      <p className="theme-danger-text mt-2 text-sm">{result.reason}</p>
                    ) : row.reason && row.outcome === "error" ? (
                      <p className="theme-danger-text mt-2 text-sm">{row.reason}</p>
                    ) : null}
                  </Surface>
                );
              })}
            </div>
          )}

          {results ? (
            <EditorNotice
              className="mt-5"
              notice={{
                tone: applyErrors > 0 ? "warning" : "success",
                title: "Template apply finished",
                message: `${applied} applied · ${summary.noMatch} no match · ${summary.protected + protectedAtSave} protected · ${excluded} excluded · ${applyErrors} errors`,
                live: true,
              }}
            />
          ) : null}
        </div>

        <DialogFooter className="border-t border-dose-border px-6 py-4 sm:items-center sm:justify-between">
          <p className="theme-text-faint text-sm">
            {includedSlugs.size} of {summary.aligned} aligned depictions included
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
              {results ? "Close" : "Cancel"}
            </Button>
            {!results ? (
              <Button
                variant="accent"
                onClick={onConfirm}
                disabled={preparing || applying || !!error || includedSlugs.size === 0}
              >
                <Icon
                  icon={applying ? "lucide:loader-2" : "lucide:check-check"}
                  size={16}
                  className={applying ? "animate-spin" : undefined}
                />
                {applying ? "Applying…" : `Confirm ${includedSlugs.size}`}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
