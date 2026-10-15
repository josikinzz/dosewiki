"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { reportClientError } from "@/lib/reportClientError";
import { StateCard } from "./StateCard";

export type ErrorBoundaryFallbackProps = {
  error: unknown;
  reset: () => void;
};

export type ErrorBoundaryProps = {
  name: string;
  children: ReactNode;
  fallback?: (props: ErrorBoundaryFallbackProps) => ReactNode;
  resetKeys?: readonly unknown[];
  className?: string;
};

type ErrorBoundaryState = { caught: { error: unknown } | null };

function keysChanged(previous: readonly unknown[] = [], next: readonly unknown[] = []) {
  return previous.length !== next.length || previous.some((key, index) => !Object.is(key, next[index]));
}

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

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { caught: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { caught: { error } };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportClientError(error, { boundary: this.props.name, componentStack: info.componentStack });
  }

  componentDidUpdate(previous: ErrorBoundaryProps, previousState: ErrorBoundaryState) {
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
