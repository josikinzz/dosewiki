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

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorSection } from "@/features/dev/components";

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

    return (
      <EditorSection
        icon="lucide:octagon-alert"
        title="The Banner Studio could not load"
        description="Nothing was changed, and no banner state was touched."
      >
        <div className="grid gap-4">
          <p className="max-w-[72ch] text-sm leading-relaxed text-dose-text-secondary">
            The preset list could not be read from Postgres. Check the server's
            database configuration and application logs, then try again.
            No banner settings were changed by this failed read.
          </p>
          <p className="max-w-[72ch] font-mono text-xs leading-relaxed text-dose-text-ghost">
            {message}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => this.setState({ message: null })}
            >
              <Icon icon="lucide:refresh-cw" size={15} />
              Try again
            </Button>
          </div>
        </div>
      </EditorSection>
    );
  }
}
