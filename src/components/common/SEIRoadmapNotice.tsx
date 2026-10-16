"use client";

import { Icon } from "@/components/common/Icon";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { quietLinkClassName } from "@/components/common/ProseLink";

const linkClassName = cn(quietLinkClassName, "whitespace-nowrap");

export function SEIRoadmapNotice({
  className,
  shimmer = false,
}: {
  className?: string;
  shimmer?: boolean;
}) {
  const t = useT();
  const [beforeLab, afterLab] = t(
    "Legacy content. A statistically backed ontology from {{lab}} is coming soon.",
  ).split("{{lab}}");
  return (
    <p
      className={cn(
        "theme-text-faint inline-flex items-start gap-1.5 text-xs leading-5 text-pretty",
        className,
      )}
    >
      <Icon icon="lucide:route" size="0.875rem" className="mt-[0.2rem] shrink-0" aria-hidden />
      <span className={shimmer ? "theme-sei-notice-shimmer" : undefined}>
        {beforeLab}
        <a
          href="https://mindstate.design"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          <span
            aria-hidden
            className="theme-mindstate-favicon ml-0.5 mr-1 inline-block size-3 shrink-0 bg-current align-[-0.125em]"
          />
          Mindstate Design Labs
        </a>
        {afterLab}
      </span>
    </p>
  );
}
