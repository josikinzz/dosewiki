import { DefinitionList, DefinitionRow } from "@/components/common/DefinitionList";
import { ContentCard } from "@/components/ui/surface";

import type { StoryDef } from "../registry/types";

const LABEL_CLASS =
  "theme-text-faint mb-1.5 text-xs font-semibold uppercase tracking-[0.18em]";
const TITLE_CLASS = "theme-accent-heading text-base font-semibold";
const PROSE_CLASS = "theme-text-secondary max-w-[68ch] break-words leading-7";

export const definitionListStory: StoryDef = {
  id: "definition-list",
  name: "Definition List",
  tier: "common",
  status: "stable",
  summary:
    "Hairline-separated term/definition rows for flat reference surfaces — a fixed-width label/title column on the left, body prose beside it. Replaces homogeneous two-up card grids.",
  source: "src/components/common/DefinitionList.tsx",
  importLine: 'import { DefinitionList, DefinitionRow } from "@/components/common";',
  exports: ["DefinitionList", "DefinitionRow"],
  examples: [
    {
      label: "Label + title rows",
      note: "Plain rows: caller owns both column elements. Dividers come from the enclosing divide-y surface.",
      full: true,
      render: () => (
        <ContentCard
          variant="subtle"
          padding="lg"
          className="divide-y divide-dose-border shadow-[var(--theme-elevation-sm)]"
        >
          <DefinitionRow
            term={
              <div>
                <div className={LABEL_CLASS}>Framework</div>
                <div className={`${TITLE_CLASS} mb-0`}>Next.js 16 + React 19</div>
              </div>
            }
          >
            <p className={PROSE_CLASS}>
              App Router with server components by default: pages fetch data on the
              server and ship mostly-static HTML.
            </p>
          </DefinitionRow>
          <DefinitionRow
            term={
              <div>
                <div className={LABEL_CLASS}>Database</div>
                <div className={`${TITLE_CLASS} mb-0`}>Postgres</div>
              </div>
            }
          >
            <p className={PROSE_CLASS}>
              Hosted document database with TypeScript server functions. The server/
              directory is the backend.
            </p>
          </DefinitionRow>
        </ContentCard>
      ),
    },
    {
      label: "Semantic glossary (<dl>/<dt>/<dd>)",
      note: "Use DefinitionList for the <dl> and `semantic` rows for real <dt>/<dd> entries.",
      full: true,
      render: () => (
        <ContentCard
          variant="subtle"
          padding="lg"
          asChild
          className="divide-y divide-dose-border shadow-[var(--theme-elevation-sm)]"
        >
          <DefinitionList>
            <DefinitionRow
              semantic
              termClassName={`${TITLE_CLASS} mb-0`}
              bodyClassName={PROSE_CLASS}
              term="Substance article"
            >
              The central data object: one large structured document per drug.
            </DefinitionRow>
            <DefinitionRow
              semantic
              termClassName={`${TITLE_CLASS} mb-0`}
              bodyClassName={PROSE_CLASS}
              term="Workbench"
            >
              An external review staging area for citation drafts.
            </DefinitionRow>
          </DefinitionList>
        </ContentCard>
      ),
    },
  ],
  props: [
    {
      name: "term",
      type: "ReactNode",
      description: "Left column — a label and/or title node (DefinitionRow).",
    },
    {
      name: "children",
      type: "ReactNode",
      description: "Right column — the definition body (DefinitionRow).",
    },
    {
      name: "semantic",
      type: "boolean",
      default: "false",
      description:
        "Render term as <dt> and children as <dd> for a real description-list entry. Use inside DefinitionList.",
    },
    {
      name: "termClassName / bodyClassName",
      type: "string",
      description: "Classes applied to the inner <dt> / <dd> when `semantic` is set.",
    },
    {
      name: "className",
      type: "string",
      description: "Merged after the grid row classes via cn — use --theme-* utilities only.",
    },
  ],
  whenToUse: [
    "Flat reference surfaces: term/definition rows inside a divide-y ContentCard (docs glossaries, tech-stack tables).",
    "Replacing a homogeneous two-up card grid with a calmer single surface.",
  ],
  whenNotToUse: [
    "Distinct, individually emphasized cards — use Card / ContentCard per item.",
    "Tabular data with many columns — use a real table.",
  ],
};
