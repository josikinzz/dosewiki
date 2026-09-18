"use client";

import { Surface } from "@/components/ui/surface";

import { stories } from "../registry";
import type { IntentFamily, StoryDef, StoryIntent } from "../registry/types";

/**
 * The catalog's "Which one?" layer: the same registry, read by intent instead
 * of by tier. A builder who needs "a chip for a substance name" finds the
 * component, sees it rendered, and can follow the policy that separates it
 * from its look-alikes. Nothing here is a second list; every row comes from a
 * story's `intents`, so the completeness test still governs the inventory.
 */
const FAMILIES: { id: IntentFamily; label: string; question: string }[] = [
  { id: "chips", label: "Chips", question: "It names something" },
  { id: "badges", label: "Badges", question: "It reports a status or a count" },
  { id: "pills", label: "Pills", question: "It carries metadata or attribution" },
  { id: "expand", label: "Expand affordances", question: "It reveals more" },
  { id: "dividers", label: "Dividers", question: "It separates" },
  { id: "cards", label: "Cards", question: "It groups content under a title" },
  { id: "surfaces", label: "Surfaces", question: "It needs a themed background before anything else" },
];

const POLICY_DOC = "https://github.com/josikinzz/dosewiki/blob/main/docs/design/ui-kit.md";

type GuideRow = { story: StoryDef; intent: StoryIntent };

export function intentRows(family: IntentFamily): GuideRow[] {
  return stories.flatMap((story) =>
    (story.intents ?? [])
      .filter((intent) => intent.family === family)
      .map((intent) => ({ story, intent })),
  );
}

export function IntentGuide() {
  return (
    <Surface id="which-one" variant="card" padding="lg" radius="xl" className="scroll-mt-24 flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-[var(--theme-text-primary)]">Which one?</h2>
        <p className="max-w-[70ch] text-sm text-[var(--theme-text-secondary)]">
          Start from what the UI has to do. Each row names the component that answers it, renders it, and links the
          policy that separates it from its look-alikes.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {FAMILIES.map((family) => {
          const rows = intentRows(family.id);
          if (rows.length === 0) return null;
          return (
            <section key={family.id} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">{family.label}</h3>
                <span className="text-xs text-[var(--theme-text-muted)]">{family.question}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {rows.map(({ story, intent }) => {
                  // Full-stage examples (sections, headers, rows) carry fixed ids and
                  // need the stage width; the story card below owns them.
                  const picked = story.examples[intent.example ?? 0];
                  const example = picked?.full ? undefined : picked;
                  return (
                    <li
                      key={`${story.id}-${intent.need}`}
                      className="theme-card-surface flex flex-col gap-2 rounded-control border p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-sm text-[var(--theme-text-secondary)]">{intent.need}</span>
                        <span className="flex items-center gap-2 text-xs">
                          <a href={`#${story.id}`} className="font-medium text-[var(--theme-accent-strong)] hover:underline">
                            {story.name}
                          </a>
                          {intent.policy ? (
                            <a
                              href={`${POLICY_DOC}${intent.policy}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--theme-text-muted)] hover:text-[var(--theme-accent-strong)] hover:underline"
                            >
                              policy
                            </a>
                          ) : null}
                        </span>
                      </div>
                      {example ? (
                        <div className="theme-text-primary flex min-w-0 flex-wrap items-center gap-2 overflow-hidden text-sm">
                          {example.render()}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Surface>
  );
}
