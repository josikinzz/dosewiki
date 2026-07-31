"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { Icon } from "@/components/common/Icon";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useArticleEdit,
  type EditableFieldValue,
  type EditableValueInput,
} from "./ArticleEditContext";

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
 */
export function EditableValue<T extends EditableValueInput = string>({
  path,
  value,
  format,
  parse,
  parseErrorLabel,
  children,
  as = "span",
  label,
  emptyLabel,
  className,
}: EditableValueProps<T>) {
  const editing = useArticleEdit();
  // The textarea is always a string; only the wire carries the parsed value.
  const toText = useCallback(
    (next: T): string => (format ? format(next) : typeof next === "string" ? next : ""),
    [format],
  );
  const text = toText(value);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Esc unmounts a focused textarea, and some browsers still fire blur on the
  // way out. Without this the cancel would immediately commit what it discarded.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isEditing) setDraft(text);
  }, [isEditing, text]);

  const finish = useCallback(() => {
    setIsEditing(false);
    setIsPending(false);
  }, []);

  const commitDraft = useCallback(
    (next: string) => {
      if (!editing || isPending) return;
      if (next === text) {
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
      editing
        // Same runtime object either way; see `EditableValueInput`.
        .commit(path, parsed as EditableFieldValue, value as EditableFieldValue)
        .then(() => {
          finish();
        })
        .catch((reason: unknown) => {
          setIsPending(false);
          setError(
            reason instanceof Error ? reason.message : "Unable to save that edit.",
          );
        });
    },
    [editing, finish, isPending, parse, parseErrorLabel, path, text, value],
  );

  // A callback ref rather than `autoFocus`: the field only mounts in response
  // to a deliberate activation, and the caret belongs at the end of the value.
  const focusOnMount = useCallback((node: HTMLTextAreaElement | null) => {
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  const startEditing = useCallback(() => {
    cancelledRef.current = false;
    setDraft(text);
    setError(null);
    setIsEditing(true);
  }, [text]);

  if (!editing) {
    return <>{children}</>;
  }

  const fieldLabel = label ?? path;
  const Wrapper = as;

  if (isEditing) {
    return (
      <Wrapper className={cn("block", className)} data-editable-path={path}>
        <Textarea
          ref={focusOnMount}
          aria-label={`Edit ${fieldLabel}`}
          textareaSize="sm"
          rows={rowsFor(draft)}
          value={draft}
          disabled={isPending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancelledRef.current = true;
              setError(null);
              finish();
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commitDraft(draft);
            }
          }}
          onBlur={() => {
            if (cancelledRef.current || isPending) return;
            commitDraft(draft);
          }}
        />
        <span className="theme-text-faint mt-1 block text-[11px] leading-tight">
          {isPending
            ? "Saving…"
            : "Enter saves · Shift+Enter new line · Esc cancels"}
        </span>
        {error ? (
          <span
            role="alert"
            className="theme-danger-text mt-1 block text-[11px] leading-tight"
          >
            {error}
          </span>
        ) : null}
      </Wrapper>
    );
  }

  return (
    <Wrapper
      role="button"
      tabIndex={0}
      aria-label={`Edit ${fieldLabel}`}
      data-editable-path={path}
      className={cn(
        "group cursor-text rounded-[3px] underline decoration-dashed decoration-transparent underline-offset-4 outline-none transition-colors duration-150",
        "hover:decoration-current focus-visible:decoration-current focus-visible:ring-1 focus-visible:ring-current",
        "motion-reduce:transition-none",
        className,
      )}
      onClick={(event: ReactMouseEvent<HTMLElement>) => {
        // Citation markers inside the value stay clickable as links.
        if (
          event.target instanceof Element &&
          event.target.closest("a") !== null
        ) {
          return;
        }
        // A clickable ancestor (an expandable card, a row that toggles) would
        // otherwise act on the same click and collapse the editor as it opens.
        event.stopPropagation();
        startEditing();
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          startEditing();
        }
      }}
    >
      {text.trim() || !emptyLabel ? (
        children
      ) : (
        <span className="theme-text-faint italic">{emptyLabel}</span>
      )}
      <Icon
        icon="lucide:pencil-line"
        size={12}
        className="ml-1 inline-block align-baseline opacity-0 transition-opacity duration-150 group-hover:opacity-60 group-focus-visible:opacity-60 motion-reduce:transition-none"
      />
    </Wrapper>
  );
}
