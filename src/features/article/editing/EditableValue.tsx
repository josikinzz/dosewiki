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
import { useArticleEdit } from "./ArticleEditContext";

interface EditableValueProps {
  /** Concrete article field path, e.g. `dosage.routes[2].notes`. */
  path: string;
  /**
   * The RAW stored value, not the rendered output. Citation markers and other
   * inline syntax must survive a round trip through the input untouched.
   */
  value: string;
  children: ReactNode;
  /**
   * Wrapper element. Stays `span` so inline call sites (a note inside a `<p>`)
   * keep producing valid markup; pass `div` when the children render blocks.
   */
  as?: "span" | "div";
  /** Human name for the field, used in the accessible label. */
  label?: string;
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
export function EditableValue({
  path,
  value,
  children,
  as = "span",
  label,
  className,
}: EditableValueProps) {
  const editing = useArticleEdit();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Esc unmounts a focused textarea, and some browsers still fire blur on the
  // way out. Without this the cancel would immediately commit what it discarded.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [isEditing, value]);

  const finish = useCallback(() => {
    setIsEditing(false);
    setIsPending(false);
  }, []);

  const commitDraft = useCallback(
    (next: string) => {
      if (!editing || isPending) return;
      if (next === value) {
        setError(null);
        finish();
        return;
      }
      setIsPending(true);
      setError(null);
      editing
        .commit(path, next, value)
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
    [editing, finish, isPending, path, value],
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
    setDraft(value);
    setError(null);
    setIsEditing(true);
  }, [value]);

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
        startEditing();
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          startEditing();
        }
      }}
    >
      {children}
      <Icon
        icon="lucide:pencil-line"
        size={12}
        className="ml-1 inline-block align-baseline opacity-0 transition-opacity duration-150 group-hover:opacity-60 group-focus-visible:opacity-60 motion-reduce:transition-none"
      />
    </Wrapper>
  );
}
