import { DisclosureCard } from "@/components/common/DisclosureCard";

import type { StoryDef } from "../registry/types";

const BODY_TEXT_CLASS = "theme-text-secondary max-w-[68ch] leading-7";

export const disclosureCardStory: StoryDef = {
  id: "disclosure-card",
  name: "DisclosureCard",
  tier: "common",
  status: "stable",
  summary:
    "Native-<details> expandable card with the summary-pill-in-frame look: zero client JS, consistent 20px content inset when open.",
  source: "src/components/common/DisclosureCard.tsx",
  importLine: 'import { DisclosureCard } from "@/components/common/DisclosureCard";',
  exports: ["DisclosureCard"],
  intents: [
    { family: "expand", need: "A card whose header opens more detail", policy: "#expand-affordance-policy" },
  ],
  examples: [
    {
      label: "Default (card variant)",
      note: "Closed by default. The chevron rotates and the frame border strengthens when open.",
      background: "plain",
      full: true,
      render: () => (
        <DisclosureCard summary="CC0 1.0 Universal — the covered material" className="w-full">
          <p className={BODY_TEXT_CLASS}>
            Expanded content sits 20px from every card edge — flush with the summary label above
            it and equal to ContentCard padding=&quot;md&quot; — so long prose never hugs the
            frame.
          </p>
        </DisclosureCard>
      ),
    },
    {
      label: "Open by default",
      note: "defaultOpen renders the <details> expanded on first paint; the browser owns it afterward.",
      background: "plain",
      full: true,
      render: () => (
        <DisclosureCard
          summary="Replication media — creator and rightsholder terms"
          defaultOpen
          className="w-full"
        >
          <p className={BODY_TEXT_CLASS}>
            Use defaultOpen for sections that are deep-link targets or must be visible without a
            click. Pair with an id and scroll-mt-* via className to make it addressable.
          </p>
          <p className={`${BODY_TEXT_CLASS} mt-3`}>
            Multiple paragraphs space themselves with ordinary mt-* utilities; the card only owns
            the outer inset.
          </p>
        </DisclosureCard>
      ),
    },
    {
      label: "Subtle variant",
      note: "Quieter frame for stacked prompt/code archives; border appears on hover and open.",
      background: "plain",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-3">
          {["Extraction prompt — summary (12 KB)", "Extraction prompt — dosage (9 KB)"].map(
            (label) => (
              <DisclosureCard key={label} summary={label} variant="subtle" className="w-full">
                <pre className="theme-text-secondary overflow-x-auto rounded-xl border border-dose-divider bg-dose-surface-muted p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap">
                  {"You are an excerpt-extraction assistant.\nCopy passages verbatim…"}
                </pre>
              </DisclosureCard>
            ),
          )}
        </div>
      ),
    },
  ],
  props: [
    {
      name: "summary",
      type: "ReactNode",
      description: "Label rendered inside the clickable summary pill, next to the chevron.",
    },
    {
      name: "children",
      type: "ReactNode",
      description: "Expanded body content, wrapped in the standard px-3 pb-3 pt-3 inset.",
    },
    {
      name: "defaultOpen",
      type: "boolean",
      default: "false",
      description:
        "Sets the native open attribute on first render. Uncontrolled after that — the browser toggles it.",
    },
    {
      name: "variant",
      type: '"card" | "subtle"',
      default: '"card"',
      description:
        "card = standard framed surface; subtle = quiet public-card-subtle frame for stacked archives.",
    },
    {
      name: "id",
      type: "string",
      description: "Applied to the <details> element, for deep links to an open-by-default section.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged onto the <details> (spacing, scroll-mt-*, width).",
    },
    {
      name: "summaryClassName",
      type: "string",
      description: "Extra classes merged onto the summary pill.",
    },
    {
      name: "bodyClassName",
      type: "string",
      description: "Extra classes merged onto the body wrapper, after the standard inset.",
    },
  ],
  whenToUse: [
    "Long-form reference content that most readers skip: license texts, prompt archives, caveats.",
    "Server-rendered doc pages where the toggle must work with zero client JS.",
  ],
  whenNotToUse: [
    "Truncating a list or paragraph in place — use ExpandableList / ExpandableText.",
    "Always-visible content sections — use ContentCard; a disclosure hides content behind a click.",
    "Stateful editor panels that need controlled open state — build on real state, not native <details>.",
  ],
  notes: [
    "Body content lands 20px from every card edge (card p-2 + body px-3 pb-3), aligned with the summary label and equal to ContentCard padding=\"md\".",
    "The group name is scoped (group/disclosure) so nesting inside other group consumers cannot leak open-state styling.",
  ],
};
