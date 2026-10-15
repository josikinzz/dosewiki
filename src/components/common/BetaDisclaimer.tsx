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
        "theme-beta-disclaimer-shell relative mx-auto block w-fit px-7",
        "max-md:max-w-[24rem] max-md:px-10 max-md:[text-wrap:pretty]",
        className,
      )}
    >
      <Icon
        icon="lucide:construction"
        size="1.25rem"
        className="theme-beta-disclaimer-icon absolute left-0 top-1/2 -translate-y-1/2 max-md:h-7 max-md:w-7"
      />
      <span className="theme-beta-shimmer">
        {t("dose.wiki is still in beta. Entries may contain inaccuracies and/or lack citations. See")}{" "}
        <SmartLink
          href="/docs/how"
          className={cn("theme-beta-disclaimer", proseLinkUnderlineClassName)}
        >
          {t("our docs")}
        </SmartLink>{" "}
        {t("for more info.")}
      </span>
      <Icon
        icon="lucide:construction"
        size="1.25rem"
        className="theme-beta-disclaimer-icon absolute right-0 top-1/2 -translate-y-1/2 max-md:h-7 max-md:w-7"
      />
    </span>
  );
}
