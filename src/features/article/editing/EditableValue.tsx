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
  path: string;
  value: T;
  format?: (value: T) => string;
  parse?: (raw: string) => T | null;
  parseErrorLabel?: string;
  citeHint?: string;
  children: ReactNode;
  as?: "span" | "div";
  label?: string;
  labelValues?: MessageValues;
  emptyLabel?: string;
  className?: string;
}

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

function rowsFor(text: string): number {
  const lines = text.split("\n").length + Math.floor(text.length / 90);
  return Math.min(12, Math.max(2, lines));
}

type FieldConflict<T> = { stored: T; storedText: string };

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
  const [conflict, setConflict] = useState<FieldConflict<T> | null>(null);
  const cancelledRef = useRef(false);
  const pendingCaretRef = useRef<number | null>(null);
  const replaceRangeRef = useRef<{ start: number; end: number } | null>(null);
  const [citeOpen, setCiteOpen] = useState(false);
  const pendingReferencesRef = useRef<Reference[]>([]);
  const [lookupWarning, setLookupWarning] = useState("");

  useEffect(() => {
    if (!isEditing) setDraft(text);
  }, [isEditing, text]);

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
        requestAnimationFrame(() => {
          field.focus();
          field.setSelectionRange(caret, caret);
        });
      }
      return next;
    });
  }, []);

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
        setError(parseError);
        return;
      }
      setIsPending(true);
      setError(null);
      setStatus(t("Applying to preview…"));
      editing
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

  const focusOnMount = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    if (!node) return;
    node.focus();
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
        data-invalid={issue ? true : undefined}
        data-editable-path={path}
        data-editable-affordance="resting"
        data-changed={changed || undefined}
        className={cn(
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
          if (
            event.target instanceof Element &&
            (event.target.closest("a") !== null ||
              event.target.closest("[data-citation-control]") !== null)
          ) {
            return;
          }
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
