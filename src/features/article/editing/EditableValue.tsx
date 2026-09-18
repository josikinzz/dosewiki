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
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
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
import {
  parseCitationMarkers,
  type CitationMarkerSpan,
} from "@/lib/citations/citationTokens";
import { useT, type MessageValues } from "@/i18n/client";

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
  /** Shown instead of committing when `parse` returns `null`. */
  parseErrorLabel?: string;
  children: ReactNode;
  /**
   * Wrapper element. Stays `span` so inline call sites (a note inside a `<p>`)
   * keep producing valid markup; pass `div` when the children render blocks.
   */
  as?: "span" | "div";
  /** Human name for the field, used in the accessible label. */
  label?: string;
  /** Interpolation values for a translated label projected outside the client boundary. */
  labelValues?: MessageValues;
  /**
   * Placeholder shown when the field is empty, e.g. "Add dosage notes". Without
   * it an absent value renders nothing and can never be filled in — but the
   * placeholder only ever appears inside an editing surface, so the public page
   * keeps rendering nothing at all.
   */
  emptyLabel?: string;
  className?: string;
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
 * unwrapped markup. Inside an editing surface it gains a hover affordance and
 * swaps to a small inline editor whose seed is the raw field value.
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
  const [status, setStatus] = useState("");
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

  const finish = useCallback(() => {
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
        setError(parseErrorLabel ?? "That is not a value this field can hold.");
        return;
      }
      setIsPending(true);
      setError(null);
      setStatus("Applying to preview…");
      editing
        // Same runtime object either way; see `EditableValueInput`.
        .commit(
          path,
          parsed as EditableFieldValue,
          baseValue as EditableFieldValue,
        )
        .then(() => {
          setStatus("Applied to local preview.");
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
              : "Unable to apply this edit locally.",
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
      editing,
      finish,
      isPending,
      parse,
      parseErrorLabel,
      path,
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
            parseErrorLabel ??
              `${label ?? path}: correct this value before saving.`,
          );
        await editing.commit(
          path,
          parsed as EditableFieldValue,
          baseValue as EditableFieldValue,
        );
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
    label,
    path,
    text,
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
    setDraft(text);
    setStatus("");
    setError(null);
    setConflict(null);
    setIsEditing(true);
  }, [text]);
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
      setDraft(text);
      setStatus("");
      setError(null);
      setConflict(null);
      pendingCaretRef.current = marker.start;
      replaceRangeRef.current = { start: marker.start, end: marker.end };
      setCiteOpen(true);
      setIsEditing(true);
    },
    [text],
  );
  /**
   * Drop one marker from the stored value. The reference stays on the article:
   * a claim losing its citation is not the source leaving the bibliography.
   */
  const removeMarker = useCallback(
    (marker: CitationMarkerSpan) => {
      if (!editing) return;
      const next =
        `${text.slice(0, marker.start)}${text.slice(marker.end)}`.replace(
          / {2,}/g,
          " ",
        );
      const parsed = parse ? parse(next) : (next as T);
      if (parsed === null) return;
      setStatus("Applying to preview…");
      editing
        .commit(path, parsed as EditableFieldValue, value as EditableFieldValue)
        .then(() => setStatus("Citation removed from local preview."))
        .catch((reason: unknown) => {
          setStatus("");
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to remove this citation.",
          );
        });
    },
    [editing, parse, path, text, value],
  );
  const markerContext = useMemo(
    () => ({ markers: parseCitationMarkers(text), citeAtMarker, removeMarker }),
    [text, citeAtMarker, removeMarker],
  );
  const cancelEditing = () => {
    cancelledRef.current = true;
    setError(null);
    setStatus("Edit cancelled.");
    finish();
  };

  if (!editing) {
    return <>{children}</>;
  }

  const fieldLabel = label ?? path;
  const Wrapper = as;
  const statusMessage = (
    <span role="status" className="sr-only">
      {status}
    </span>
  );

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
            if (cancelledRef.current || isPending || conflict) return;
            commitDraft(draft);
          }}
        >
          <Textarea
            ref={focusOnMount}
            aria-label={`Edit ${fieldLabel}`}
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
            {isPending ? "Applying to preview…" : "Enter applies · Esc cancels"}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            {editing.addReference && !conflict ? (
              <CitePopover
                open={citeOpen}
                onOpenChange={setCiteOpen}
                references={editing.references ?? []}
                addReference={editing.addReference}
                onInsert={insertAtCaret}
                disabled={isPending}
              />
            ) : null}
            {/* Enter and Esc already do this on a keyboard. A touch editor has
              neither, so the explicit pair renders only where it is the only
              way to finish the field. */}
            {!conflict ? (
              <Button
                type="button"
                variant="glass"
                size="quiet"
                className="hidden [@media(pointer:coarse)]:inline-flex"
                disabled={isPending}
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  commitDraft(draft);
                }}
              >
                Apply locally
              </Button>
            ) : null}
            <Button
              type="button"
              variant="pill"
              size="quiet"
              className="hidden [@media(pointer:coarse)]:inline-flex"
              disabled={isPending}
              onPointerDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                cancelEditing();
              }}
            >
              Cancel
            </Button>
          </span>
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
            /* Below the box rather than over it: the reviewer's own text stays
             the thing in focus, and a phone keyboard is already covering the
             bottom half of the screen. `asChild` keeps this a `span` so the
             panel is still valid markup inside an inline field. */
            <Surface
              asChild
              variant="subtle"
              padding="xs"
              radius="md"
              className="mt-2"
            >
              <span className="block">
                <span className="theme-text-faint block text-sm font-semibold">
                  Current preview
                </span>
                {/* Capped and scrollable: a long note must not push the two
                  choices below the fold on a phone. */}
                <span className="theme-text-secondary mt-1 block max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-snug">
                  {conflict.storedText.trim() || (
                    <span className="theme-text-faint italic">(empty)</span>
                  )}
                </span>
                <span className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="glass"
                    size="quiet"
                    className="h-auto max-w-full whitespace-normal text-left"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      commitDraft(draft);
                    }}
                    disabled={isPending}
                  >
                    <Icon icon="lucide:check" size={14} />
                    Apply my text to preview
                  </Button>
                  <Button
                    type="button"
                    variant="pill"
                    size="quiet"
                    className="h-auto max-w-full whitespace-normal text-left"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDraft(conflict.storedText);
                      setError(null);
                      textareaRef.current?.focus();
                    }}
                    disabled={isPending}
                  >
                    <Icon icon="lucide:corner-down-left" size={14} />
                    Use current preview text
                  </Button>
                </span>
              </span>
            </Surface>
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
        aria-label={`Edit ${fieldLabel}`}
        data-editable-path={path}
        className={cn(
          "group relative cursor-text rounded-[3px] underline decoration-dashed decoration-transparent underline-offset-4 outline-none transition-colors duration-150",
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
    </>
  );
}
