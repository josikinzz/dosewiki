"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { Icon } from "@/components/common/Icon";
import { proseLinkUnderlineClassName } from "@/components/common/ProseLink";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export function BetaDisclaimer({ className }: { className?: string }) {
  const t = useT();

  return (
    <span
      className={cn(
        "theme-beta-disclaimer-shell theme-beta-disclaimer-callout mx-auto flex w-fit max-w-full items-start gap-2.5 rounded-lg border px-3.5 py-2",
        "max-md:max-w-[24rem] max-md:[text-wrap:pretty]",
        className,
      )}
    >
      <Icon
        icon="lucide:construction"
        size="1.25rem"
        className="theme-beta-disclaimer-icon mt-[0.1em] shrink-0"
      />
      <span className="theme-beta-shimmer min-w-0">
        {t("dose.wiki is still in beta. Entries may contain inaccuracies and/or lack citations. See")}{" "}
        <SmartLink
          href="/docs/how"
          className={cn("theme-beta-disclaimer", proseLinkUnderlineClassName)}
        >
          {t("our docs")}
        </SmartLink>{" "}
        {t("for more info.")}
      </span>
    </span>
  );
}
