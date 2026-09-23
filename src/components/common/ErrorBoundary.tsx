"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { reportClientError } from "@/lib/reportClientError";
import { StateCard } from "./StateCard";

export type ErrorBoundaryFallbackProps = {
  error: unknown;
  /** Clears the error and renders the children again. */
  reset: () => void;
};

export type ErrorBoundaryProps = {
  /** Stable region name carried into the error report, e.g. `replication-viewer-stage`. */
  name: string;
  children: ReactNode;
  /** Region-specific fallback; defaults to a compact translated state. */
  fallback?: (props: ErrorBoundaryFallbackProps) => ReactNode;
  /** A change in any key clears a caught error, e.g. the active work's slug. */
  resetKeys?: readonly unknown[];
  className?: string;
};

type ErrorBoundaryState = { caught: { error: unknown } | null };

function keysChanged(previous: readonly unknown[] = [], next: readonly unknown[] = []) {
  return previous.length !== next.length || previous.some((key, index) => !Object.is(key, next[index]));
}

/** The default region fallback; a custom `fallback` may render it inside its own frame. */
export function ErrorBoundaryFallback({ reset, className }: ErrorBoundaryFallbackProps & { className?: string }) {
  const t = useT();
  return (
    <div role="alert" className={className}>
      <StateCard
        compact
        tone="danger"
        icon="lucide:triangle-alert"
        title={t("This part of the page could not load")}
        description={t("The rest of the page still works. Try again, or reload the page if this keeps happening.")}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            {t("Try again")}
          </Button>
        }
      />
    </div>
  );
}

/**
 * Keeps a render failure inside one region: the region shows a fallback, the
 * page around it stays interactive, and the error is reported once.
 *
 * A class component because `componentDidCatch` has no hook equivalent. The
 * fallback is a function component so its copy goes through `useT()`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { caught: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { caught: { error } };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportClientError(error, { boundary: this.props.name, componentStack: info.componentStack });
  }

  componentDidUpdate(previous: ErrorBoundaryProps, previousState: ErrorBoundaryState) {
    // Only an error already on screen before this update resets: the update that
    // caught a new error may carry new keys too, and retrying it would loop.
    if (
      this.state.caught &&
      previousState.caught &&
      keysChanged(previous.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ caught: null });
  };

  render() {
    const { caught } = this.state;
    if (!caught) return this.props.children;

    const fallbackProps = { error: caught.error, reset: this.reset };
    return this.props.fallback ? (
      this.props.fallback(fallbackProps)
    ) : (
      <ErrorBoundaryFallback {...fallbackProps} className={this.props.className} />
    );
  }
}
