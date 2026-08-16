import {
  SafetyBanner,
  SafetyBannerLinks,
  SafetyBannerPoints,
  SafetyBannerTitle,
} from "@/components/ui/safety-banner";

import type { StoryDef } from "../registry/types";

export const safetyBannerStory: StoryDef = {
  id: "safety-banner",
  name: "SafetyBanner",
  tier: "primitive",
  status: "stable",
  summary:
    "The drug-class safety banner that sits above a substance article's H1: a tonal card with an icon/severity gutter, a claim, mechanism bullets, and anchor chips into the sections that expand it.",
  source: "src/components/ui/safety-banner.tsx",
  importLine:
    'import { SafetyBanner, SafetyBannerTitle, SafetyBannerPoints, SafetyBannerLinks } from "@/components/ui/safety-banner";',
  exports: [
    "SafetyBanner",
    "SafetyBannerTitle",
    "SafetyBannerPoints",
    "SafetyBannerLinks",
    "safetyBannerVariants",
  ],
  examples: [
    {
      label: "Danger",
      note: "The depressant-respiratory preset. Rose surface, role=\"alert\".",
      background: "plain",
      render: () => (
        <SafetyBanner variant="danger" icon="lucide:wind" severityLabel="Danger">
          <SafetyBannerTitle>Mixing depressants stops breathing</SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "CNS depression is additive: two moderate doses of different depressants can exceed a lethal dose of either.",
              "Respiratory depression is silent. There is no struggle to wake up from.",
              "Naloxone reverses opioids only. It does nothing for benzodiazepines, barbiturates, GHB, or alcohol.",
            ]}
          />
          <SafetyBannerLinks
            links={[
              { label: "Combinations", sectionId: "interactions" },
              { label: "Harm potential", sectionId: "harm-potential" },
            ]}
          />
        </SafetyBanner>
      ),
    },
    {
      label: "Unsafe",
      note: "The dissociative-psychosis preset. Orange surface, role=\"status\".",
      background: "plain",
      render: () => (
        <SafetyBanner variant="unsafe" icon="lucide:octagon-alert" severityLabel="Unsafe">
          <SafetyBannerTitle>Narrow margin, real psychosis risk</SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "3-MeO-PCP has an unusually narrow gap between a recreational dose and a toxic one. Weigh volumetrically; do not eyeball.",
              "Compulsive redosing drives stimulant-like mania and psychosis lasting days after the dissociation ends.",
            ]}
          />
          <SafetyBannerLinks links={[{ label: "Dosage", sectionId: "dosage" }]} />
        </SafetyBanner>
      ),
    },
    {
      label: "Caution",
      note: "Amber surface. Copy is the gabaergic-withdrawal preset, re-toned here so the third surface is visible — the shipped preset stores danger.",
      background: "plain",
      render: () => (
        <SafetyBanner variant="caution" icon="lucide:activity" severityLabel="Caution">
          <SafetyBannerTitle>Stopping abruptly can cause seizures</SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "Physical dependence can form within 2–4 weeks of daily use.",
              "Taper under medical supervision. Never stop daily use cold turkey.",
            ]}
          />
          <SafetyBannerLinks links={[{ label: "Tolerance", sectionId: "tolerance" }]} />
        </SafetyBanner>
      ),
    },
    {
      label: "Editor-written link labels",
      note: 'The chips read "Dangerous combinations" and "What the toxidrome does" over the interactions and harm-potential anchors. Labels are stored fields rendered verbatim, never derived from the section id.',
      background: "plain",
      render: () => (
        <SafetyBanner variant="danger" icon="lucide:eye" severityLabel="Danger">
          <SafetyBannerTitle>A deliriant, not a psychedelic</SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "Produces true hallucinations that are indistinguishable from reality — people hold conversations with people who are not there.",
              "Insight and recall are absent. You cannot talk yourself down.",
            ]}
          />
          <SafetyBannerLinks
            links={[
              { label: "Dangerous combinations", sectionId: "interactions" },
              { label: "What the toxidrome does", sectionId: "harm-potential" },
            ]}
          />
        </SafetyBanner>
      ),
    },
    {
      label: "Dimmed",
      note: "Studio-only. How a preset that is enabled on no substance previews, so a preview is never mistaken for what readers see.",
      background: "plain",
      render: () => (
        <SafetyBanner dimmed variant="danger" icon="lucide:skull" severityLabel="Danger">
          <SafetyBannerTitle>Tolerance falls faster than you think</SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "After 3–7 days without opioids, a previously routine dose can be fatal. Most overdoses follow a break.",
              "Carry naloxone. Do not dose alone behind a locked door.",
            ]}
          />
          <SafetyBannerLinks links={[{ label: "Tolerance", sectionId: "tolerance" }]} />
        </SafetyBanner>
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: '"danger" | "unsafe" | "caution"',
      default: '"danger"',
      description:
        "Severity tone. Drives the theme-interaction-* card surface and the root ink colour that the gutter glyph, severity label, bullet dots, and link chips inherit. Tonal only — it says how bad the risk is, never which feature is rendering.",
    },
    {
      name: "icon",
      type: "IconName",
      description:
        'Iconify id for the gutter glyph, e.g. "lucide:wind" or a repo "custom:" glyph. Editor-authored free text on the preset, so any collection resolves.',
    },
    {
      name: "severityLabel",
      type: "string",
      description:
        'The word under the glyph, e.g. "Danger". A stored field, not derived from the tone — an editor may write "Fatal risk" over a danger-tone banner.',
    },
    {
      name: "dimmed",
      type: "boolean",
      default: "false",
      description:
        "Reduces opacity and saturation. For the Banner Studio preview of a preset that renders nowhere; never used on a public article.",
    },
    {
      name: "role",
      type: "string",
      default: '"alert" for danger, otherwise "status"',
      description:
        'ARIA live-region role, defaulted by tone exactly as Alert does: danger announces assertively, unsafe and caution announce politely.',
    },
    {
      name: "children",
      type: "ReactNode",
      description:
        "Body column content. Compose SafetyBannerTitle, SafetyBannerPoints, and SafetyBannerLinks.",
    },
    {
      name: "points (SafetyBannerPoints)",
      type: "string[]",
      description:
        "Mechanism bullets, one <li> each with a tone-coloured dot. Renders null when empty. Capped at 76ch measure.",
    },
    {
      name: "links (SafetyBannerLinks)",
      type: "WarningBannerLink[]",
      description:
        "Anchor chips to #${sectionId} rendering label verbatim. Renders null when empty.",
    },
  ],
  whenToUse: [
    "Editor-enabled drug-class warnings at the very top of a substance article, above the H1.",
    "The Banner Studio preview of a preset an editor is authoring (pair with `dimmed` when the preset renders nowhere).",
  ],
  whenNotToUse: [
    "Article status chips such as ArticleStubBanner or ReviewStatusBanner — those report the state of the page, not a drug risk.",
    "Safety callouts inside an article section — use Surface's DangerCallout recipe.",
    "Form, save, or inline feedback in the editor — use Alert.",
  ],
  notes: [
    "The component never decides whether it appears. Enablement is editorial: a preset renders on a substance only when `enabled` is true and the slug is in `enabledSlugs`, resolved by `resolveEnabledBanners` in src/data/substanceWarningBanners.ts and managed at /dev/banners. Nothing derives a banner from a substance's classification.",
    "SafetyBannerTitle is a <p>, not a heading — the banner sits above the article <h1> and must not enter the document outline or a screen reader's heading list.",
    "Link chip text is a stored field rendered verbatim. WARNING_BANNER_SECTION_LABELS is the authoring-time suggestion applied by normalizeLinks, never a render-time lookup.",
    "The two-column gutter collapses to a stacked row below 560px, with the hairline moving from the right edge to the bottom.",
  ],
};
