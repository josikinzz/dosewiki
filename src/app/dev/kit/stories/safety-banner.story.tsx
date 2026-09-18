import {
  SafetyBanner,
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
    "The safety banner that sits above a substance article's H1: a tonal card holding a 44px glyph, a dark severity chip, a claim, and the mechanism text that backs it.",
  source: "src/components/ui/safety-banner.tsx",
  importLine:
    'import { SafetyBanner, SafetyBannerTitle, SafetyBannerPoints } from "@/components/ui/safety-banner";',
  exports: [
    "SafetyBanner",
    "SafetyBannerTitle",
    "SafetyBannerPoints",
    "safetyBannerVariants",
  ],
  examples: [
    {
      label: "Danger",
      note: 'The depressant-respiratory preset. Rose surface, role="alert". Three markdown-marked lines, so a list.',
      background: "plain",
      render: () => (
        <SafetyBanner variant="danger" icon="lucide:wind">
          <SafetyBannerTitle severityLabel="Danger" tone="danger">
            Mixing depressants stops breathing
          </SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "- CNS depression is additive: two moderate doses of different depressants can exceed a lethal dose of either.",
              "- Respiratory depression is silent. There is no struggle to wake up from.",
              "- Naloxone reverses opioids only. It does nothing for benzodiazepines, barbiturates, GHB, or alcohol.",
            ]}
          />
        </SafetyBanner>
      ),
    },
    {
      label: "Unsafe",
      note: 'The dissociative-psychosis preset. Orange surface, role="status". Unmarked lines, so paragraphs.',
      background: "plain",
      render: () => (
        <SafetyBanner variant="unsafe" icon="lucide:octagon-alert">
          <SafetyBannerTitle severityLabel="Unsafe" tone="unsafe">
            Narrow margin, real psychosis risk
          </SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "3-MeO-PCP has an unusually narrow gap between a recreational dose and a toxic one. Weigh volumetrically; do not eyeball.",
              "Compulsive redosing drives stimulant-like mania and psychosis lasting days after the dissociation ends.",
            ]}
          />
        </SafetyBanner>
      ),
    },
    {
      label: "Caution",
      note: "Amber surface. Copy is the gabaergic-withdrawal preset, re-toned here so the third surface is visible — the shipped preset stores danger.",
      background: "plain",
      render: () => (
        <SafetyBanner variant="caution" icon="lucide:activity">
          <SafetyBannerTitle severityLabel="Caution" tone="caution">
            Stopping abruptly can cause seizures
          </SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "Physical dependence can form within 2–4 weeks of daily use.",
              "Taper under medical supervision. Never stop daily use cold turkey.",
            ]}
          />
        </SafetyBanner>
      ),
    },
    {
      label: "Bullets are opt-in",
      note: "The same two sentences twice. Plain lines render as paragraphs; the same lines opened with a markdown `- ` render as a list. Nothing about the count changes the shape — only the marker does, so an editor who wants prose gets prose.",
      background: "plain",
      render: () => (
        <div className="flex flex-col gap-4">
          <SafetyBanner variant="danger" icon="lucide:skull">
            <SafetyBannerTitle severityLabel="Danger" tone="danger">
              Tolerance falls faster than you think
            </SafetyBannerTitle>
            <SafetyBannerPoints
              points={[
                "After 3–7 days without opioids, a previously routine dose can be fatal. Most overdoses follow a break.",
                "Carry naloxone. Do not dose alone behind a locked door.",
              ]}
            />
          </SafetyBanner>
          <SafetyBanner variant="danger" icon="lucide:skull">
            <SafetyBannerTitle severityLabel="Danger" tone="danger">
              Tolerance falls faster than you think
            </SafetyBannerTitle>
            <SafetyBannerPoints
              points={[
                "- After 3–7 days without opioids, a previously routine dose can be fatal. Most overdoses follow a break.",
                "- Carry naloxone. Do not dose alone behind a locked door.",
              ]}
            />
          </SafetyBanner>
        </div>
      ),
    },
    {
      label: "Mixed prose and list",
      note: "A lead paragraph followed by marked lines. Consecutive markers collapse into one list rather than a run of one-item lists.",
      background: "plain",
      render: () => (
        <SafetyBanner variant="danger" icon="lucide:eye">
          <SafetyBannerTitle severityLabel="Danger" tone="danger">
            A deliriant, not a psychedelic
          </SafetyBannerTitle>
          <SafetyBannerPoints
            points={[
              "Produces true hallucinations indistinguishable from reality — people hold conversations with people who are not there.",
              "- Insight and recall are absent. You cannot talk yourself down.",
              "- Anticholinergic toxidrome: hyperthermia, tachycardia, urinary retention.",
            ]}
          />
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
        "Severity tone. Drives the theme-interaction-* card surface, the severity chip's paired badge class, and the root ink colour that the glyph and bullet dots inherit. Tonal only — it says how bad the risk is, never which feature is rendering.",
    },
    {
      name: "icon",
      type: "IconName",
      description:
        'Iconify id for the 44px glyph, e.g. "lucide:wind" or a repo "custom:" glyph. Editor-authored free text on the preset, so any collection resolves. Omit it and the card collapses to a single column rather than leaving an empty gutter.',
    },
    {
      name: "severityLabel (SafetyBannerTitle)",
      type: "string",
      description:
        'The word in the dark chip, e.g. "Danger". A stored field, not derived from the tone — an editor may write "Fatal risk" over a danger-tone banner. It lives on the title rather than the banner so the chip and the headline share one row structurally.',
    },
    {
      name: "tone (SafetyBannerTitle)",
      type: '"danger" | "unsafe" | "caution"',
      default: '"danger"',
      description:
        "Picks the chip's paired badge class. Pass the same tone as the banner's variant; the chip is the one element that cannot inherit it through currentColor.",
    },
    {
      name: "role",
      type: "string",
      default: '"alert" for danger, otherwise "status"',
      description:
        "ARIA live-region role, defaulted by tone exactly as Alert does: danger announces assertively, unsafe and caution announce politely.",
    },
    {
      name: "children",
      type: "ReactNode",
      description: "Body column content. Compose SafetyBannerTitle and SafetyBannerPoints.",
    },
    {
      name: "points (SafetyBannerPoints)",
      type: "string[]",
      description:
        "The mechanism text, one entry per line of the editor's field. A line renders as a <p> unless it opens with a markdown marker (- or *), which is the only thing that makes a bullet; consecutive marked lines collapse into one <ul> with tone-coloured dots. Renders null when empty. Capped at 76ch measure.",
    },
  ],
  whenToUse: [
    "Editor-enabled warnings at the very top of a substance article, above the H1.",
    "The Banner Studio preview of a preset an editor is authoring — at full strength, never faded: the state belongs in a status pill, not in the legibility of the thing being previewed.",
  ],
  whenNotToUse: [
    "Article status chips such as ArticleStubBanner or ReviewStatusBanner — those report the state of the page, not a drug risk.",
    "Safety callouts inside an article section — use Surface's DangerCallout recipe.",
    "Form, save, or inline feedback in the editor — use Alert.",
  ],
  notes: [
    "The component never decides whether it appears. Enablement is editorial: a preset must be enabled and target either an explicit slug list or all substance articles. `resolveEnabledBanners` owns that rule; classification never assigns a banner.",
    "SafetyBannerTitle is a <p>, not a heading — the banner sits above the article <h1> and must not enter the document outline or a screen reader's heading list.",
    "Bullets are a consequence, not a requirement. SafetyBannerPoints renders a single point as a paragraph, so an editor with one thing to say never ships a list of one.",
    "There is no divider between the glyph and the body. The tone surface already groups them; the hairline the first cut drew only chopped the card in half.",
    "The severity chip reuses theme-interaction-severity-badge-*, the same class the interactions table uses. Nested inside the root's theme-interaction-<tone> it drops to the deeper field surface in both themes, which is what makes it read as a chip rather than as loose small caps.",
    "The two columns stack below 560px. The glyph column is `auto`, so a resize widens the column rather than overflowing a rail.",
    "The glyph size is one site-wide editor setting, not a per-banner prop. It is stored on the `safety-banner-display` siteConfig document, edited once in the Banner Studio toolbar, and threaded to every banner on the site so no two warnings are drawn at different weights — which is why it is `iconSize` and not a cva variant. Every example below renders at the shipped default (44px).",
  ],
};
