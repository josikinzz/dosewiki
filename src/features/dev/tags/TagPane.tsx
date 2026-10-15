"use client";

import { useId, type FormEvent, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import {
  EditorCheckbox,
  EditorField,
  EditorNavTabs,
  EditorPanel,
  EditorSelect,
  EditorStatusPill,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { viewToPath } from "@/utils/routing";
import { TAG_FIELD_LABELS, TAG_FIELDS, normalizeTagLabel, type TagArticleRef, type TagField, type TagRegistry, type TagUsage } from "@/utils/data/tagRegistry";

import { CappedList, LINK_LIST_CLASS } from "../tools/home/homeParts";
import { TagFeedback } from "./TagFeedback";
import { articleWord, checkRename, existingTagFor, similarTags, type RenameCheck } from "./tagEditorModel";
import type { NoticeSource, TagNoticeState, TagUndo } from "./types";

export type TagChangeView = "rename" | "move" | "remove";

export type TagApplying = NoticeSource | "undo" | null;

type TagPaneProps = {
  usage: TagUsage;
  registry: TagRegistry;
  changed: boolean;
  view: TagChangeView;
  onViewChange: (view: TagChangeView) => void;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRename: (event: FormEvent<HTMLFormElement>) => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  moveTargetField: TagField;
  onMoveTargetFieldChange: (field: TagField) => void;
  moveLabel: string;
  onMoveLabelChange: (value: string) => void;
  keepSourceCopy: boolean;
  onKeepSourceCopyChange: (keep: boolean) => void;
  onMove: (event: FormEvent<HTMLFormElement>) => void;
  onRequestRemove: () => void;
  isApplying: boolean;
  applying: TagApplying;
  notice: TagNoticeState | null;
  undo: TagUndo | null;
  onUndo: () => void;
  pendingArticles: number | null;
  onReviewChanges: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBackToList: () => void;
  hiddenBySearch?: boolean;
  onClearSearch?: () => void;
};

const VIEW_LABELS: Record<TagChangeView, string> = { rename: "Rename or merge", move: "Move", remove: "Remove" };

export function TagPane(props: TagPaneProps) {
  const { usage, view, onViewChange, titleRef } = props;
  const idBase = useId();
  const panelId = (name: TagChangeView) => `${idBase}-${name}`;
  const fieldLabel = TAG_FIELD_LABELS[usage.field];

  return (
    <EditorPanel className="overflow-visible">
      <header className="theme-portal-rule space-y-2 border-b px-4 py-4 sm:px-5">
        <Button
          type="button"
          variant="link"
          size="auto"
          className={cn("text-sm lg:hidden", TOUCH_HALO_Y)}
          onClick={props.onBackToList}
        >
          <Icon icon="lucide:arrow-left" size={14} />
          Back to list
        </Button>
        <p className="type-meta-label theme-text-muted">{fieldLabel}</p>
        <h3
          ref={titleRef}
          tabIndex={-1}
          className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none"
        >
          <span className="sr-only">Tag: </span>
          {usage.tag}
        </h3>
        <p className="theme-text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="tabular-nums">{`On ${articleWord(usage.count)}`}</span>
          {props.changed ? (
            <EditorStatusPill tone="info" inline>
              Changed in your working changes
            </EditorStatusPill>
          ) : null}
        </p>
        {props.hiddenBySearch ? (
          <p className="theme-text-muted flex flex-wrap items-center gap-x-2 text-xs">
            <Icon icon="lucide:eye-off" size={13} className="theme-text-faint" />
            <span>Your search hides this tag from the list; changes below still apply to it.</span>
            {props.onClearSearch ? (
              <Button type="button" variant="link" size="auto" className={cn("text-xs", TOUCH_HALO_Y)} onClick={props.onClearSearch}>
                Clear the search
              </Button>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="space-y-7 px-4 py-5 sm:px-5 [&_:is(input,button,select)]:scroll-mb-40 [&_:is(input,button,select)]:scroll-mt-28">
        <PaneSection title="Articles" note="Opens the public article in a new tab.">
          <CappedList
            items={usage.articleRefs}
            getKey={(ref) => `${ref.index}-${ref.id ?? "no-id"}`}
            label={`Articles tagged ${usage.tag}`}
            noun="articles"
            renderItem={(ref) => <ArticleRow articleRef={ref} />}
          />
        </PaneSection>

        <SimilarTags {...props} />

        <section aria-labelledby={`${idBase}-change`} className="space-y-4">
          <div className="space-y-0.5">
            <h4 id={`${idBase}-change`} className="theme-text-primary text-sm font-semibold">Change it everywhere</h4>
            <p className="theme-text-muted max-w-[75ch] text-xs">
              {`Each change rewrites ${usage.count === 1 ? "the article" : `all ${articleWord(usage.count)}`} at once and joins your working changes. You can undo the last one until you make another.`}
            </p>
          </div>
          <EditorNavTabs
            label="Change this tag"
            value={view}
            onChange={(value) => onViewChange(value as TagChangeView)}
            options={(["rename", "move", "remove"] as const).map((value) => ({
              value,
              label: VIEW_LABELS[value],
              controls: panelId(value),
            }))}
          />
          <div id={panelId("rename")} role="tabpanel" aria-label={VIEW_LABELS.rename} hidden={view !== "rename"}>
            <RenameForm {...props} />
          </div>
          <div id={panelId("move")} role="tabpanel" aria-label={VIEW_LABELS.move} hidden={view !== "move"}>
            <MoveForm {...props} />
          </div>
          <div id={panelId("remove")} role="tabpanel" aria-label={VIEW_LABELS.remove} hidden={view !== "remove"}>
            <RemoveBlock {...props} />
          </div>
        </section>
      </div>

      <TagDock {...props} />
    </EditorPanel>
  );
}

function PaneSection({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <div className="space-y-0.5">
        <h4 id={id} className="theme-text-primary text-sm font-semibold">{title}</h4>
        {note ? <p className="theme-text-muted max-w-[75ch] text-xs">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ArticleRow({ articleRef }: { articleRef: TagArticleRef }) {
  const label = articleRef.title?.trim()?.length ? articleRef.title : `Article ${articleRef.index + 1}`;
  const identifier = typeof articleRef.id === "number" ? `#${articleRef.id}` : `Index ${articleRef.index + 1}`;
  const href = articleRef.slug ? viewToPath({ type: "substance", slug: articleRef.slug }) : undefined;
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="theme-text-faint flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
        <span className="sr-only">, </span>
        {identifier}
        {href ? (
          <>
            <Icon icon="lucide:external-link" size={13} className="theme-dev-link-row-chevron" />
            <span className="sr-only">(opens in new tab)</span>
          </>
        ) : null}
      </span>
    </>
  );
  const rowClass = "flex min-h-11 items-center gap-3 rounded-control px-2.5 py-2 text-sm";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("theme-dev-link-row group theme-focus-ring transition-colors motion-reduce:transition-none", rowClass)}>
      {body}
    </a>
  ) : (
    <div className={cn("theme-text-secondary", rowClass)}>{body}</div>
  );
}

function SimilarTags({ usage, registry, onViewChange, onRenameValueChange, renameInputRef, isApplying }: TagPaneProps) {
  const similar = similarTags(registry, usage);
  if (similar.length === 0) return null;
  return (
    <PaneSection
      title="Looks like the same tag"
      note={`Written differently in ${TAG_FIELD_LABELS[usage.field]}. Merging moves every article onto one label.`}
    >
      <ul className={LINK_LIST_CLASS}>
        {similar.map((other) => (
          <li key={other.key} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-1.5 text-sm">
            <span className="min-w-0">
              <span className="theme-text-primary break-words">{other.tag}</span>
              <span className="theme-text-faint text-xs tabular-nums">
                <span className="sr-only">, </span>
                {` on ${articleWord(other.count)}`}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={isApplying}
              onClick={() => {
                onViewChange("rename");
                onRenameValueChange(other.tag);
                window.requestAnimationFrame(() => renameInputRef.current?.focus());
              }}
            >
              <Icon icon="lucide:merge" size={13} />
              {`Merge into “${other.tag}”`}
            </Button>
          </li>
        ))}
      </ul>
    </PaneSection>
  );
}

function renameHint(check: RenameCheck, usage: TagUsage): { text: string; tone: "muted" | "warning" | "info" } {
  switch (check.kind) {
    case "empty":
      return { text: "Type the label this tag should have.", tone: "muted" };
    case "same":
      return { text: "That is the label it has now. Type a different one.", tone: "muted" };
    case "case":
      return { text: `Changes only the capitals: “${usage.tag}” becomes “${check.label}” on ${articleWord(usage.count)}.`, tone: "muted" };
    case "merge":
      return {
        text: `“${check.into.tag}” already exists here on ${articleWord(check.into.count)}. Renaming merges the two, so ${articleWord(check.total)} will carry “${check.into.tag}” and “${usage.tag}” goes away.`,
        tone: "info",
      };
    case "rename":
      return { text: `Every article that carries “${usage.tag}” will carry “${check.label}” instead.`, tone: "muted" };
  }
}

function RenameForm({ usage, registry, renameValue, onRenameValueChange, onRename, renameInputRef, isApplying, applying }: TagPaneProps) {
  const check = checkRename(registry, usage, renameValue);
  const hint = renameHint(check, usage);
  const blocked = check.kind === "empty" || check.kind === "same";
  const merging = check.kind === "merge";
  const pending = isApplying && applying === "rename";
  const label = pending
    ? merging ? "Merging" : "Renaming"
    : merging ? `Merge into “${check.into.tag}”` : `Rename in ${articleWord(usage.count)}`;
  return (
    <form className="space-y-3" onSubmit={onRename}>
      <EditorField label="New label" htmlFor="tag-rename-label">
        {({ id }) => (
          <Input
            ref={renameInputRef}
            id={id}
            type="text"
            value={renameValue}
            aria-describedby="tag-rename-hint"
            placeholder="Enter new label"
            autoComplete="off"
            onChange={(event) => onRenameValueChange(event.target.value)}
            className="text-[16px] md:text-sm"
          />
        )}
      </EditorField>
      <p
        id="tag-rename-hint"
        aria-live="polite"
        className={cn(
          "flex items-start gap-1.5 text-xs",
          hint.tone === "info" ? "theme-text-secondary" : "theme-text-muted",
        )}
      >
        {merging ? <Icon icon="lucide:merge" size={13} className="theme-icon-accent mt-0.5 shrink-0" /> : null}
        <span className="max-w-[75ch]">{hint.text}</span>
      </p>
      <Button type="submit" variant="accent" size="sm" disabled={isApplying || blocked} aria-busy={pending || undefined}>
        <Icon icon={merging ? "lucide:merge" : "lucide:pencil"} size={14} />
        {label}
      </Button>
    </form>
  );
}

function MoveForm({
  usage,
  registry,
  moveTargetField,
  onMoveTargetFieldChange,
  moveLabel,
  onMoveLabelChange,
  keepSourceCopy,
  onKeepSourceCopyChange,
  onMove,
  isApplying,
  applying,
}: TagPaneProps) {
  const sourceLabel = TAG_FIELD_LABELS[usage.field];
  const targetLabel = TAG_FIELD_LABELS[moveTargetField];
  const landingLabel = normalizeTagLabel(moveLabel) || usage.tag;
  const already = moveTargetField !== usage.field ? existingTagFor(registry, moveTargetField, landingLabel) : null;
  const pending = isApplying && applying === "move";
  const verb = keepSourceCopy ? "Copy" : "Move";
  const outcome = keepSourceCopy
    ? `Adds “${landingLabel}” to ${targetLabel} on ${articleWord(usage.count)} and keeps “${usage.tag}” in ${sourceLabel}.`
    : `Takes “${usage.tag}” out of ${sourceLabel} and adds “${landingLabel}” to ${targetLabel} on ${articleWord(usage.count)}.`;
  return (
    <form className="space-y-3" onSubmit={onMove}>
      <div className="grid gap-3 sm:grid-cols-2">
        <EditorField label="To field" htmlFor="move-target-field">
          <EditorSelect
            id="move-target-field"
            selectSize="sm"
            value={moveTargetField}
            onChange={(event) => onMoveTargetFieldChange(event.target.value as TagField)}
            options={TAG_FIELDS.filter((field) => field !== usage.field).map((field) => ({ value: field, label: TAG_FIELD_LABELS[field] }))}
          />
        </EditorField>
        <EditorField label="Label there (optional)" htmlFor="move-label">
          <Input
            id="move-label"
            type="text"
            value={moveLabel}
            autoComplete="off"
            onChange={(event) => onMoveLabelChange(event.target.value)}
            placeholder={usage.tag}
            className="text-[16px] md:text-sm"
          />
        </EditorField>
      </div>
      <EditorCheckbox
        checked={keepSourceCopy}
        onChange={(event) => onKeepSourceCopyChange(event.target.checked)}
        label={`Keep it in ${sourceLabel} too`}
        containerClassName="items-center"
      />
      <div aria-live="polite" className="theme-text-muted max-w-[75ch] space-y-1 text-xs">
        <p>{outcome}</p>
        {already ? (
          <p>{`${targetLabel} already has “${already.tag}” on ${articleWord(already.count)}; those articles are left as they are.`}</p>
        ) : null}
      </div>
      <Button type="submit" variant="accent" size="sm" disabled={isApplying} aria-busy={pending || undefined}>
        <Icon icon={keepSourceCopy ? "lucide:copy" : "lucide:arrow-left-right"} size={14} />
        {pending ? (keepSourceCopy ? "Copying" : "Moving") : `${verb} to ${targetLabel} in ${articleWord(usage.count)}`}
      </Button>
    </form>
  );
}

function RemoveBlock({ usage, onRequestRemove, isApplying, applying }: TagPaneProps) {
  const pending = isApplying && applying === "delete";
  return (
    <div className="space-y-3">
      <p className="theme-text-muted max-w-[75ch] text-sm">
        {`Takes “${usage.tag}” off ${articleWord(usage.count)}. The articles keep their other tags. It asks first, you can undo it until your next change here, and nothing goes live until you commit.`}
      </p>
      <Button type="button" variant="ghostDestructive" size="sm" className="-ml-2" disabled={isApplying} aria-busy={pending || undefined} onClick={onRequestRemove}>
        <Icon icon="lucide:trash-2" size={14} />
        {pending ? "Removing" : `Remove from ${articleWord(usage.count)}`}
      </Button>
    </div>
  );
}

export function TagDock({ notice, undo, onUndo, isApplying, applying, pendingArticles, onReviewChanges }: Pick<TagPaneProps, "notice" | "undo" | "onUndo" | "isApplying" | "applying" | "pendingArticles" | "onReviewChanges">) {
  const shown = notice && notice.source !== "diff" ? notice : null;
  return (
    <footer
      aria-label="Result"
      className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
    >
      {isApplying ? (
        <p aria-live="polite" className="theme-text-muted flex items-center gap-2 text-sm">
          <Icon icon="lucide:loader-circle" size={14} className="animate-spin motion-reduce:animate-none" />
          {applying === "undo" ? "Putting the articles back" : "Loading the articles this changes, then rewriting them"}
        </p>
      ) : shown ? (
        <TagFeedback
          notice={shown}
          undo={undo?.source === shown.source ? undo : null}
          onUndo={onUndo}
          busy={isApplying}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", pendingArticles ? "theme-text-secondary" : "theme-text-faint")}>
          {pendingArticles ? (
            <>
              <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
              {`${articleWord(pendingArticles)} in your working changes, not live yet`}
            </>
          ) : (
            "Nothing waiting to commit"
          )}
        </p>
        {pendingArticles ? (
          <Button type="button" variant="outline" size="xs" onClick={onReviewChanges}>
            Review and commit
            <Icon icon="lucide:arrow-up" size={13} />
          </Button>
        ) : null}
      </div>
    </footer>
  );
}
