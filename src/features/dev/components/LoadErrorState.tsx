import type { ReactNode } from "react";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";

export interface LoadErrorStateProps {
  message: string;
  onRetry: () => void;
  busy?: boolean;
  /** Quiet fallback beside the retry button, such as a link to another route. */
  secondary?: ReactNode;
}

/**
 * The one retry affordance for a load failure: what went wrong in plain
 * words, and a single button that tries again. `busy` locks the button while
 * the retry is in flight.
 */
export function LoadErrorState({ message, onRetry, busy = false, secondary }: LoadErrorStateProps) {
  return (
    <StateCard
      tone="danger"
      icon="lucide:circle-alert"
      compact
      align="left"
      title="Could not load this data"
      description={message}
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
