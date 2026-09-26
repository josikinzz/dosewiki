"use client";

/**
 * Error boundary for rendering the Studio and its live display settings.
 *
 * The `siteConfig:getBannerDisplay` editor read throws during render when the
 * server cannot answer (an outage, or a deployment where the function is not
 * present yet). Without a boundary that throw escapes to the `/dev` route's error UI and
 * the whole shell reads "Something went wrong", which loses the tab chrome, the
 * other tools, and any hint about what actually failed.
 *
 * Design brief §7 lists `error` as one of the eight states every control needs;
 * this is that state for the tab's own data. It degrades one tab rather than the
 * page, and it names the likely cause, because the first time an editor sees this
 * screen will be immediately after a deploy that has not reached Postgres yet.
 *
 * A class component because `componentDidCatch` has no hook equivalent, and the
 * repo has no existing boundary to reuse.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

import { EditorSection, LoadErrorState } from "@/features/dev/components";

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
    // Editor-facing tool: the stack is the useful artifact, so log it rather
    // than swallowing it into the rendered message.
    console.error("Banner Studio failed to load:", error, info.componentStack);
  }

  render() {
    const { message } = this.state;
    if (message === null) {
      return this.props.children;
    }

    // Try again clears the boundary, which re-renders the studio and so
    // re-reads the display setting.
    return (
      <div>
        <EditorSection icon="lucide:triangle-alert" title="Banners">
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
        </EditorSection>
      </div>
    );
  }
}
