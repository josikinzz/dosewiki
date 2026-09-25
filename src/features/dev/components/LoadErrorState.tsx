import type { ReactNode } from "react";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";

export interface LoadErrorStateProps {
  message: string;
  onRetry: () => void;
  busy?: boolean;
  /**
   * What failed to load, in the editor's words ("pending invites", "the
   * glossary"), so the title names it: "Could not load pending invites".
   */
  what?: string;
  /** Quiet fallback beside the retry button, such as a link to another route. */
  secondary?: ReactNode;
}

/** A route or method and a path ("GET /api/dev/invites") is for whoever debugs it, not the editor. */
const TECHNICAL_MESSAGE = /\/api\/\S+/;

export function isTechnicalLoadMessage(message: string): boolean {
  return TECHNICAL_MESSAGE.test(message);
}

/**
 * The one retry affordance for a load failure: what went wrong in plain
 * words, and a single button that tries again. `busy` locks the button while
 * the retry is in flight. A message that reads like a request log is tucked
 * under "Details" behind a plain sentence, and the card says who to tell if
 * retrying keeps failing.
 */
export function LoadErrorState({ message, onRetry, busy = false, what, secondary }: LoadErrorStateProps) {
  const technical = isTechnicalLoadMessage(message);
  return (
    <StateCard
      tone="danger"
      icon="lucide:circle-alert"
      compact
      align="left"
      title={what ? `Could not load ${what}` : "Could not load this data"}
      description={
        <>
          <span className="block">
            <span className="theme-text-secondary">{technical ? "The server did not answer the request." : message}</span>{" "}
            <span className="theme-text-muted">Try again. If it keeps failing, tell an admin.</span>
          </span>
          {technical ? (
            <details className="mt-2 text-xs">
              <summary className="theme-text-muted cursor-pointer select-none">Details</summary>
              <code className="theme-text-secondary mt-1 block break-words">{message}</code>
            </details>
          ) : null}
        </>
      }
      actions={
        <>
          <Button type="button" variant="outline" size="sm" disabled={busy} aria-busy={busy || undefined} onClick={onRetry}>
            {busy ? "Retrying" : "Try again"}
          </Button>
          {secondary}
        </>
      }
    />
  );
}
