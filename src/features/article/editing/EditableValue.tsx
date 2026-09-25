"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { Icon } from "@/components/common/Icon";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_PILL } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import {
  FieldMarkerProvider,
  isArticleFieldConflict,
  useArticleEdit,
  type EditableFieldValue,
  type EditableValueInput,
} from "./ArticleEditContext";
import { CitePopover } from "./CitePopover";
import { FieldConflictPanel, TouchFinishButtons } from "./EditableValueControls";
import {
  parseCitationMarkers,
  type CitationMarkerSpan,
} from "@/lib/citations/citationTokens";
import { useT, type MessageValues } from "@/i18n/client";
import type { Reference } from "@/schema";
import { findEquivalentReference } from "../../../../lib/citations/referenceIdentity.mjs";

interface EditableValueProps<T extends EditableValueInput = string> {
  /** Concrete article field path, e.g. `dosage.routes[2].notes`. */
  path: string;
  /**
   * The RAW stored value, not the rendered output. Citation markers and other
   * inline syntax must survive a round trip through the input untouched.
   */
  value: T;
  /**
   * Renders the stored value as the text the editor starts from. Defaults to
   * the identity for prose; a range field passes its own formatter so the
   * editor opens on `10-20 mg` rather than on an object.
   */
  format?: (value: T) => string;
  /**
   * Turns the edited text back into a stored value, or `null` when the text is
   * not a value at all.
   *
   * A `null` result must never be committed. Coercing an unparseable dose to
   * `{min: null, max: null, unit: ""}` is exactly how a stored range gets
   * destroyed by a typo, so this field surfaces the failure and keeps the draft
   * on screen instead.
   */
  parse?: (raw: string) => T | null;
  /**
   * Message key shown instead of committing when `parse` returns `null`.
   * Translated here with `labelValues`, like `label`.
   */
  parseErrorLabel?: string;
  /**
   * Message key saying where to cite this value instead. A parsed field has
   * no Cite control: its parser would read a marker as part of the stored
   * value (a dose unit of `mg[cite:x]`), so the field says where the citation
   * belongs.
   */
  citeHint?: string;
  children: ReactNode;
  /**
   * Wrapper element. Stays `span` so inline call sites (a note inside a `<p>`)
   * keep producing valid markup; pass `div` when the children render blocks.
   */
  as?: "span" | "div";
  /**
   * Message key naming the field, used in the accessible label. A name built
   * from data is a template (`"{{route}} dosage notes"`) with its parts in
   * `labelValues`, never a finished sentence: only the template is a key.
   */
  label?: string;
  /** Interpolation values for `label`, `emptyLabel` and `parseErrorLabel`. */
  labelValues?: MessageValues;
  /**
   * Message key for the placeholder shown when the field is empty, e.g. "Add dosage notes". Without
   * it an absent value renders nothing and can never be filled in — but the
   * placeholder only ever appears inside an editing surface, so the public page
   * keeps rendering nothing at all.
   */
  emptyLabel?: string;
  className?: string;
}

/**
 * The field text with one marker taken out, and the one space that separated
 * it from the claim when nothing else needs that space. Everything else in
 * the text, deliberate double spaces included, stays exactly as stored.
 */
export function withoutMarker(
  text: string,
  marker: Pick<CitationMarkerSpan, "start" | "end">,
): string {
  let before = text.slice(0, marker.start);
  let after = text.slice(marker.end);
  if (before.endsWith(" ") && (after === "" || /^[\s.,;:!?)]/.test(after))) {
    before = before.slice(0, -1);
  } else if (before === "" && after.startsWith(" ")) {
    after = after.slice(1);
  }
  return `${before}${after}`;
}

/** Roughly fits the editor to the text without a resize observer. */
function rowsFor(text: string): number {
  const lines = text.split("\n").length + Math.floor(text.length / 90);
  return Math.min(12, Math.max(2, lines));
}

/**
 * A refused-as-stale commit, once the surface has told us what landed instead.
 *
 * Holding the stored value here is what turns the refusal into a recoverable
 * step: it is both the thing shown to the reviewer and the baseline the retry
 * is sent against, so re-applying the same typed text is a normal write rather
 * than a second guess at what the store holds.
 */
type FieldConflict<T> = { stored: T; storedText: string };

/**
 * Click-to-edit wrapper for one article field.
 *
 * Without an `ArticleEditContext` — which is every public render — this is a
 * fragment: the children pass through and the DOM is byte-identical to the
 * unwrapped markup. Inside an editing surface it draws a resting outline, on
 * every pointer and without hover, so an editor sees what can change before
 * reaching for it; a dot marks a value that differs from the published
 * article, and a validation problem with the value shows beside it the moment
 * the edit applies. Activating it swaps to a small inline editor whose seed
 * is the raw field value.
 *
 * Enter commits, Shift+Enter inserts a newline, Esc cancels, blur commits.
 * A failed commit keeps the article's prior value and shows the reason inline
 * so a rejected edit is never mistaken for a saved one.
 *
 * A commit refused because the stored value moved is recoverable in place: the
 * typed text stays on screen and editable, the value that landed underneath is
 * shown next to it, and the reviewer either saves over it or takes it. Nothing
 * about that path guesses — the surface supplies the newer value through
 * `refreshStoredValue`, and a surface that cannot answer shows only the reason.
 */
export function EditableValue<T extends EditableValueInput = string>({
  path,
  value,
  format,
  parse,
  parseErrorLabel,
  citeHint: citeHintKey = "Cite this value in the notes beside it.",
  children,
  as = "span",
  label: labelKey,
  labelValues,
  emptyLabel: emptyLabelKey,
  className,
}: EditableValueProps<T>) {
  const t = useT();
  const label = labelKey === undefined ? undefined : t(labelKey, labelValues);
  const emptyLabel =
    emptyLabelKey === undefined ? undefined : t(emptyLabelKey, labelValues);
  const citeHint = t(citeHintKey);
  const parseError = t(
    parseErrorLabel ?? "That is not a value this field can hold.",
    labelValues,
  );
  const editing = useArticleEdit();
  // The textarea is always a string; only the wire carries the parsed value.
  const toText = useCallback(
    (next: T): string =>
      format ? format(next) : typeof next === "string" ? next : "",
    [format],
  );
  const text = toText(value);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the field last announced. Progress and cancellation are for screen
  // readers only; an outcome (Applied, a removed citation) is also drawn next
  // to the value for a few seconds, because a field that quietly closes reads
  // the same whether the edit landed or not.
  const [status, setStatusState] = useState({ text: "", shown: false });
  const setStatus = useCallback(
    (text: string, shown = false) => setStatusState({ text, shown }),
    [],
  );
  useEffect(() => {
    if (!status.shown) return;
    const timer = window.setTimeout(
      () => setStatusState((current) => ({ ...current, shown: false })),
      4000,
    );
    return () => window.clearTimeout(timer);
  }, [status]);
  const fieldId = useId();
  const editorRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreFocusRef = useRef(false);
  // Set only by a rejection the write layer coded as a conflict, and only when
  // the surface could name the value that landed. While it is held the field
  // writes against `stored` instead of `value`: the prop is the copy that was
  // already refused once, and retrying against it would only be refused again.
  const [conflict, setConflict] = useState<FieldConflict<T> | null>(null);
  // Esc unmounts a focused textarea, and some browsers still fire blur on the
  // way out. Without this the cancel would immediately commit what it discarded.
  const cancelledRef = useRef(false);
  // Where the caret belongs when the textarea mounts, set by a marker
  // activation and consumed once.
  const pendingCaretRef = useRef<number | null>(null);
  // The span a chosen citation replaces instead of being inserted beside it.
  // Set when a citation-needed flag opened this field: the sentinel is the
  // thing being answered, so the new marker takes its place.
  const replaceRangeRef = useRef<{ start: number; end: number } | null>(null);
  const [citeOpen, setCiteOpen] = useState(false);
  // Sources minted by Cite while this field is open. They belong to the draft,
  // not the article: Esc drops them with the text, and only an apply hands
  // them to the surface. Otherwise a cancelled edit leaves an uncited source
  // in the reference list for review to trip over.
  const pendingReferencesRef = useRef<Reference[]>([]);
  // A metadata lookup that failed while citing. Lives on the field, because
  // the popover that noticed it closes the moment the marker lands.
  const [lookupWarning, setLookupWarning] = useState("");

  useEffect(() => {
    if (!isEditing) setDraft(text);
  }, [isEditing, text]);

  /**
   * Place a citation marker where the editor was typing.
   *
   * The caret is read from the textarea because that is where the editor put
   * it; with nothing focused the marker goes to the end, which is where a
   * citation belongs for the sentence just finished. A selection is kept and
   * the marker follows it rather than replacing the words it supports.
   *
   * A field opened from a citation-needed flag replaces the sentinel instead,
   * so answering a flag never leaves both the flag and the answer in place.
   */
  const insertAtCaret = useCallback((marker: string) => {
    const field = textareaRef.current;
    const replacing = replaceRangeRef.current;
    replaceRangeRef.current = null;
    setDraft((current) => {
      const at = replacing
        ? replacing.start
        : field
          ? Math.max(field.selectionStart, field.selectionEnd)
          : current.length;
      const after = replacing ? replacing.end : at;
      const next = `${current.slice(0, at)}${marker}${current.slice(after)}`;
      if (field) {
        const caret = at + marker.length;
        // After the popover closes, so the field owns focus again.
        requestAnimationFrame(() => {
          field.focus();
          field.setSelectionRange(caret, caret);
        });
      }
      return next;
    });
  }, []);

  /**
   * Hold a source for this draft and answer with the id its marker uses. A
   * source the article, or this draft, already has answers with that id.
   */
  const addDraftReference = useCallback(
    (reference: Reference): string => {
      const known = [
        ...(editing?.references ?? []),
        ...pendingReferencesRef.current,
      ];
      const existing = findEquivalentReference(known, reference);
      if (existing?.id) return existing.id;
      pendingReferencesRef.current = [
        ...pendingReferencesRef.current,
        reference,
      ];
      return reference.id;
    },
    [editing?.references],
  );

  /**
   * Hand the draft's sources to the surface once its text has applied. A
   * source whose marker was deleted again before applying is not cited by
   * anything, so it is dropped rather than added.
   */
  const commitPendingReferences = useCallback(
    (applied: string) => {
      const pendingReferences = pendingReferencesRef.current;
      pendingReferencesRef.current = [];
      if (!editing?.addReference) return;
      for (const reference of pendingReferences) {
        if (applied.includes(`[cite:${reference.id}]`)) {
          editing.addReference(reference);
        }
      }
    },
    [editing],
  );

  const finish = useCallback(() => {
    pendingReferencesRef.current = [];
    setLookupWarning("");
    restoreFocusRef.current =
      document.activeElement === document.body ||
      !!editorRef.current?.contains(document.activeElement);
    setIsEditing(false);
    setIsPending(false);
    setConflict(null);
  }, []);

  const focusTriggerOnMount = useCallback((node: HTMLElement | null) => {
    if (!node || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    node.focus();
  }, []);

  useEffect(() => {
    if (
      isEditing &&
      !isPending &&
      error &&
      document.activeElement === document.body
    ) {
      textareaRef.current?.focus();
    }
  }, [error, isEditing, isPending]);
  // What the store is believed to hold right now, and how it reads. Equal to
  // the rendered value until a conflict retargets the field at the value that
  // landed underneath it.
  const baseValue = conflict ? conflict.stored : value;
  const baseText = conflict ? conflict.storedText : text;

  const commitDraft = useCallback(
    (next: string) => {
      if (!editing || isPending) return;
      if (next === baseText) {
        setError(null);
        finish();
        return;
      }
      const parsed = parse ? parse(next) : (next as T);
      if (parsed === null) {
        // Never coerce: the stored value stays exactly as it was, and the
        // unparseable draft stays on screen where it can be corrected.
        setError(parseError);
        return;
      }
      setIsPending(true);
      setError(null);
      setStatus(t("Applying to preview…"));
      editing
        // Same runtime object either way; see `EditableValueInput`.
        .commit(
          path,
          parsed as EditableFieldValue,
          baseValue as EditableFieldValue,
        )
        .then(() => {
          commitPendingReferences(next);
          setStatus(t("Applied"), true);
          finish();
        })
        .catch((reason: unknown) => {
          // The draft is deliberately left alone here, and `isEditing` with it:
          // a refused write must cost the reviewer the save, never the typing.
          setIsPending(false);
          setStatus("");
          setError(
            reason instanceof Error
              ? reason.message
              : t("Unable to apply this edit locally."),
          );

          if (!isArticleFieldConflict(reason)) {
            return;
          }
          // Only a conflict earns the recovery panel, and only when the surface
          // can actually name what landed. `null` means it has nothing fresher
          // than the copy that was just refused, so there is nothing to show
          // and nothing to retry against — the reason alone is the honest end.
          const stored =
            editing.refreshStoredValue?.(
              path,
              baseValue as EditableFieldValue,
            ) ?? null;
          if (stored === null) {
            setConflict(null);
            return;
          }
          const storedText = toText(stored as T);
          if (storedText === baseText) {
            setConflict(null);
            return;
          }
          setConflict({ stored: stored as T, storedText });
        });
    },
    [
      baseText,
      baseValue,
      commitPendingReferences,
      editing,
      finish,
      isPending,
      parse,
      parseError,
      path,
      setStatus,
      t,
      toText,
    ],
  );
  useEffect(() => {
    if (!editing?.registerDraft || !isEditing || draft === baseText) return;
    return editing.registerDraft(path, {
      save: async () => {
        const parsed = parse ? parse(draft) : (draft as T);
        if (parsed === null)
          throw new Error(
            parseErrorLabel === undefined
              ? t("{{field}}: correct this value before saving.", {
                  field: label ?? path,
                })
              : parseError,
          );
        await editing.commit(
          path,
          parsed as EditableFieldValue,
          baseValue as EditableFieldValue,
        );
        commitPendingReferences(draft);
        finish();
      },
      discard: () => {
        cancelledRef.current = true;
        setDraft(text);
        finish();
      },
    });
  }, [
    editing?.registerDraft,
    editing?.commit,
    isEditing,
    draft,
    baseText,
    baseValue,
    parse,
    parseErrorLabel,
    parseError,
    label,
    path,
    t,
    text,
    commitPendingReferences,
    finish,
  ]);

  // A callback ref rather than `autoFocus`: the field only mounts in response
  // to a deliberate activation, and the caret belongs at the end of the value.
  const focusOnMount = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    if (!node) return;
    node.focus();
    // A marker activation asked for a specific caret; everything else opens at
    // the end of the value, which is where a person resumes typing.
    const at = pendingCaretRef.current ?? node.value.length;
    pendingCaretRef.current = null;
    node.setSelectionRange(at, at);
  }, []);

  const startEditing = useCallback(() => {
    cancelledRef.current = false;
    pendingReferencesRef.current = [];
    setLookupWarning("");
    setDraft(text);
    setStatus("");
    setError(null);
    setConflict(null);
    setIsEditing(true);
  }, [setStatus, text]);
  /**
   * Open this field at one of its own markers.
   *
   * A citation-needed flag is the entry point the citation campaign leaves
   * behind, so activating it opens the editor with the caret on the sentinel
   * and the cite control already showing. Choosing a source then replaces the
   * sentinel rather than leaving the editor to delete raw text by hand.
   */
  const citeAtMarker = useCallback(
    (marker: CitationMarkerSpan) => {
      cancelledRef.current = false;
      pendingReferencesRef.current = [];
      setLookupWarning("");
      setDraft(text);
      setStatus("");
      setError(null);
      setConflict(null);
      pendingCaretRef.current = marker.start;
      replaceRangeRef.current = { start: marker.start, end: marker.end };
      setCiteOpen(true);
      setIsEditing(true);
    },
    [setStatus, text],
  );
  /**
   * Drop one marker from the stored value. The reference stays on the article:
   * a claim losing its citation is not the source leaving the bibliography.
   */
  const removeMarker = useCallback(
    (marker: CitationMarkerSpan) => {
      if (!editing) return;
      const next = withoutMarker(text, marker);
      const parsed = parse ? parse(next) : (next as T);
      if (parsed === null) return;
      setStatus(t("Applying to preview…"));
      editing
        .commit(path, parsed as EditableFieldValue, value as EditableFieldValue)
        .then(() => setStatus(t("Citation removed"), true))
        .catch((reason: unknown) => {
          setStatus("");
          setError(
            reason instanceof Error
              ? reason.message
              : t("Unable to remove this citation."),
          );
        });
    },
    [editing, parse, path, setStatus, t, text, value],
  );
  const markerContext = useMemo(
    () => ({ markers: parseCitationMarkers(text), citeAtMarker, removeMarker }),
    [text, citeAtMarker, removeMarker],
  );
  const cancelEditing = () => {
    cancelledRef.current = true;
    setError(null);
    setStatus(t("Edit cancelled."));
    finish();
  };

  if (!editing) {
    return <>{children}</>;
  }

  const fieldLabel = label ?? path;
  const editLabel = t("Edit {{field}}", { field: fieldLabel });
  const Wrapper = as;
  const statusMessage = (
    <span
      role="status"
      data-editable-status
      className={
        status.shown && !isEditing
          ? "theme-text-muted ms-1.5 text-xs font-normal not-italic"
          : "sr-only"
      }
    >
      {status.text}
    </span>
  );
  // Only a value this session changed carries its problem inline: untouched
  // legacy values are the review sheet's business, and a group rule (one unit
  // per route) should point at the tier that broke it, not at every tier.
  const changed = editing.isChanged?.(path) ?? false;
  const issue =
    !isEditing && (changed || !editing.isChanged)
      ? (editing.fieldIssue?.(path) ?? null)
      : null;

  if (isEditing) {
    return (
      <>
        <Wrapper
          ref={(node) => {
            editorRef.current = node;
          }}
          className={cn(
            className,
            "block min-w-0 text-base font-normal leading-normal tracking-normal [font-family:var(--font-family-body)] md:text-sm",
          )}
          data-editable-path={path}
          aria-busy={isPending}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            // Cite's panel renders in a portal, so focus entering it looks like
            // focus leaving the field. Choosing a source is part of the edit.
            if (cancelledRef.current || isPending || conflict || citeOpen) return;
            commitDraft(draft);
          }}
        >
          <Textarea
            ref={focusOnMount}
            aria-label={editLabel}
            aria-describedby={`${fieldId}-hint${error ? ` ${fieldId}-error` : ""}`}
            aria-invalid={!!error}
            variant={error ? "error" : "default"}
            textareaSize="sm"
            rows={rowsFor(draft)}
            value={draft}
            disabled={isPending}
            // The open editor can sit inside a clickable ancestor (the Notable
            // Individuals card is one big button). Without this, every click in
            // the textarea would also toggle that ancestor shut.
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelEditing();
                return;
              }
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                commitDraft(draft);
              }
            }}
            // Focus moving to the field's own actions is not a blur-apply.
            // The wrapper handles only focus leaving the complete editor.
          />
          <span
            id={`${fieldId}-hint`}
            className="theme-text-faint mt-1 block text-sm leading-snug"
          >
            {isPending
              ? t("Applying to preview…")
              : t("Enter applies · Esc cancels")}
            {parse && editing.addReference ? (
              <span className="block">{citeHint}</span>
            ) : null}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            {editing.addReference && !conflict && !parse ? (
              <CitePopover
                open={citeOpen}
                onOpenChange={setCiteOpen}
                references={editing.references ?? []}
                addReference={addDraftReference}
                onLookupWarning={setLookupWarning}
                onInsert={insertAtCaret}
                disabled={isPending}
              />
            ) : null}
            <TouchFinishButtons
              showApply={!conflict}
              isPending={isPending}
              onApply={() => commitDraft(draft)}
              onCancel={cancelEditing}
            />
          </span>
          {lookupWarning ? (
            <span
              role="status"
              className="theme-warning-text mt-1 block text-sm leading-snug"
            >
              {lookupWarning}
            </span>
          ) : null}
          {error ? (
            <span
              id={`${fieldId}-error`}
              role="alert"
              className="theme-danger-text mt-1 block text-sm leading-snug"
            >
              {error}
            </span>
          ) : null}
          {conflict ? (
            <FieldConflictPanel
              storedText={conflict.storedText}
              isPending={isPending}
              onApplyMine={() => commitDraft(draft)}
              onUseStored={() => {
                setDraft(conflict.storedText);
                setError(null);
                textareaRef.current?.focus();
              }}
            />
          ) : null}
        </Wrapper>
        {statusMessage}
      </>
    );
  }

  return (
    <>
      <Wrapper
        ref={focusTriggerOnMount}
        role="button"
        tabIndex={0}
        aria-label={editLabel}
        aria-describedby={
          [changed && `${fieldId}-changed`, issue && `${fieldId}-issue`]
            .filter(Boolean)
            .join(" ") || undefined
        }
        // A button cannot be aria-invalid; the problem reaches assistive
        // technology through the description above and the alert below.
        data-invalid={issue ? true : undefined}
        data-editable-path={path}
        data-editable-affordance="resting"
        data-changed={changed || undefined}
        className={cn(
          // The resting outline is the affordance: present on every pointer
          // and without hover, so edit mode shows at a glance what can change.
          "group relative cursor-text rounded-[3px] underline decoration-dashed decoration-transparent underline-offset-4 outline-1 outline-offset-1 outline-dashed transition-colors duration-150",
          issue ? "outline-dose-danger" : "outline-dose-border-strong",
          "hover:decoration-current focus-visible:decoration-current focus-visible:ring-1 focus-visible:ring-current",
          "motion-reduce:transition-none",
          TOUCH_PILL,
          "[@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:py-2 [@media(pointer:coarse)]:decoration-current",
          as === "span" ? "[@media(pointer:coarse)]:inline-block" : "pe-5",
          className,
        )}
        onClick={(event: ReactMouseEvent<HTMLElement>) => {
          // Citation markers inside the value stay clickable as links, and in an
          // editing surface they carry their own controls; either way the click
          // belongs to the marker and must not also open the field.
          if (
            event.target instanceof Element &&
            (event.target.closest("a") !== null ||
              event.target.closest("[data-citation-control]") !== null)
          ) {
            return;
          }
          // A clickable ancestor (an expandable card, a row that toggles) would
          // otherwise act on the same click and collapse the editor as it opens.
          event.stopPropagation();
          startEditing();
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            startEditing();
          }
        }}
      >
        <FieldMarkerProvider value={markerContext}>
          {text.trim() || !emptyLabel ? (
            children
          ) : (
            <span className="theme-text-faint italic">{emptyLabel}</span>
          )}
        </FieldMarkerProvider>
        {changed ? (
          <>
            <span
              aria-hidden
              data-changed-dot
              className={cn(
                "inline-block size-1.5 rounded-full bg-dose-accent",
                as === "div"
                  ? "absolute -start-2.5 top-2"
                  : "ms-1 align-middle",
              )}
            />
            <span id={`${fieldId}-changed`} className="sr-only">
              {t("Changed from the published article")}
            </span>
          </>
        ) : null}
        <Icon
          icon="lucide:pencil-line"
          size={12}
          className={cn(
            "opacity-0 transition-opacity duration-150 group-hover:opacity-60 group-focus-visible:opacity-60 [@media(pointer:coarse)]:opacity-60 motion-reduce:transition-none",
            as === "div"
              ? "absolute end-0 top-1 [@media(pointer:coarse)]:top-3"
              : "ml-1 inline-block align-baseline",
          )}
        />
      </Wrapper>
      {statusMessage}
      {issue ? (
        <span
          id={`${fieldId}-issue`}
          role="alert"
          className="theme-danger-text mt-1 block text-xs font-normal not-italic leading-snug"
        >
          {issue}
        </span>
      ) : null}
    </>
  );
}
