"use client";

import { Icon } from "@/components/common/Icon";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { APPROVED_REPLICATOR_LABEL } from "../replicationVocabulary";

export function ApprovedReplicatorStar({ className }: { className?: string }) {
  const t = useT();
  return (
    <span
      className={cn("theme-icon-accent inline-flex shrink-0 items-center", className)}
      title={t(APPROVED_REPLICATOR_LABEL)}
      data-testid="approved-replicator-star"
    >
      <Icon
        icon="lucide:star"
        className="h-[1em] w-[1em] [&_path]:fill-current"
        size="1em"
      />
      <span className="sr-only">{t(APPROVED_REPLICATOR_LABEL)}</span>
    </span>
  );
}
