import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";

import type { StoryDef } from "../registry/types";

export const doseWikiLogoStory: StoryDef = {
  id: "dose-wiki-logo",
  name: "DoseWikiLogo",
  tier: "common",
  status: "stable",
  summary:
    "The dose.wiki wordmark, rendered as a CSS-masked span so it inherits the current theme color. Drives the header and footer logos.",
  source: "src/components/common/DoseWikiLogo.tsx",
  importLine: 'import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";',
  exports: ["DoseWikiLogo"],
  examples: [
    {
      label: "Sizes",
      note: "width and height are required (they annotate the box); set the rendered size via style — the class does not size itself.",
      render: () => (
        <div className="flex items-end gap-6">
          <DoseWikiLogo width={96} height={24} style={{ width: 96, height: 24 }} />
          <DoseWikiLogo width={140} height={36} style={{ width: 140, height: 36 }} />
          <DoseWikiLogo width={200} height={52} style={{ width: 200, height: 52 }} />
        </div>
      ),
    },
    {
      label: "Theme-driven fill",
      note: "The mark is filled with --theme-logo-fill, so it flips automatically with the light/dark toggle above — no per-use color needed.",
      background: "card",
      render: () => (
        <DoseWikiLogo width={180} height={46} style={{ width: 180, height: 46 }} />
      ),
    },
    {
      label: "Decorative",
      note: "Pass ariaHidden when the wordmark is purely decorative beside a text label.",
      render: () => (
        <DoseWikiLogo ariaHidden width={120} height={30} style={{ width: 120, height: 30 }} />
      ),
    },
  ],
  props: [
    { name: "width", type: "number", description: "Required intrinsic width; also annotates the box via data attributes." },
    { name: "height", type: "number", description: "Required intrinsic height." },
    { name: "alt", type: "string", default: "site flavor logo label", description: "Accessible name; ignored when ariaHidden. Defaults to the active flavor's label." },
    { name: "config", type: "SiteFlavorConfig", default: "ambient flavor", description: "Injected flavor config; picks the mark asset and default label." },
    { name: "ariaHidden", type: "boolean", default: "false", description: "Hide from the a11y tree for decorative use." },
    { name: "style", type: "CSSProperties", description: "Set the rendered width/height here (the mark fills its box)." },
    { name: "className", type: "string", description: "Extra classes merged after theme-dosewiki-logo." },
  ],
  whenToUse: [
    "The dose.wiki wordmark in chrome (header, footer) or brand surfaces.",
    "Anywhere the logo should track the theme automatically (it fills with --theme-logo-fill).",
  ],
  whenNotToUse: [
    "As a generic image — it is a single-color masked mark, not a full-color asset.",
    "When you need a link; wrap it in a Link/anchor yourself.",
  ],
  notes: [
    "Renders a masked <span> filled with var(--theme-logo-fill); the .theme-dosewiki-logo class sets the mask but not the size, so pass width/height via style.",
  ],
};
