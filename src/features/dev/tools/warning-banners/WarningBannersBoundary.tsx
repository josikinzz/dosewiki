"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { LoadErrorState } from "@/features/dev/components";

type WarningBannersBoundaryProps = {
  children: ReactNode;
};

type WarningBannersBoundaryState = {
  message: string | null;
};

export class WarningBannersBoundary extends Component<
  WarningBannersBoundaryProps,
  WarningBannersBoundaryState
> {
  state: WarningBannersBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): WarningBannersBoundaryState {
    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Banner Studio failed to load:", error, info.componentStack);
  }

  render() {
    const { message } = this.state;
    if (message === null) {
      return this.props.children;
    }

    return (
      <div>
        <DevToolSection tool="banners">
          <div className="max-w-3xl space-y-3">
            <LoadErrorState
              what="the banner display settings"
              message={message}
              onRetry={() => this.setState({ message: null })}
            />
            <p className="theme-text-muted text-sm">
              Nothing was changed, and no banner was touched. If this follows a deploy, the
              server may not have the display setting yet; its logs say more.
            </p>
          </div>
        </DevToolSection>
      </div>
    );
  }
}
