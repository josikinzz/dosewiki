"use client";

import { useId, useState } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";

import { count } from "./glossaryModel";

export function PendingTermsList({ terms, limit = 8 }: { terms: readonly string[]; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const restId = useId();

  if (terms.length === 0) return null;

  const shown = terms.slice(0, limit);
  const rest = terms.slice(limit);

  return (
    <p className="theme-text-secondary text-xs" data-testid="glossary-pending">
      Waiting for a retranslate: {shown.join(", ")}
      {rest.length > 0 ? (
        <>
          <span id={restId} hidden={!expanded}>, {rest.join(", ")}</span>
          {" "}
          <ExpandButton
            variant="inline"
            isExpanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            label={count(rest.length, "more term")}
            ariaControls={restId}
          />
        </>
      ) : null}
    </p>
  );
}
