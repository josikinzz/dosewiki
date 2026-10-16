import type { ReactNode } from "react";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";

export interface LoadErrorStateProps {
  message: string;
  onRetry: () => void;
  busy?: boolean;
  what?: string;
  secondary?: ReactNode;
}

const TECHNICAL_MESSAGE = /\/api\/\S+/;

export function isTechnicalLoadMessage(message: string): boolean {
  return TECHNICAL_MESSAGE.test(message);
}

const TRAILING_TRY_AGAIN = /\s*Try again\.?\s*$/i;

export function LoadErrorState({ message, onRetry, busy = false, what, secondary }: LoadErrorStateProps) {
  const technical = isTechnicalLoadMessage(message);
  const plain = message.replace(TRAILING_TRY_AGAIN, "") || message;
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
            <span className="theme-text-secondary">{technical ? "The server did not answer the request." : plain}</span>{" "}
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
