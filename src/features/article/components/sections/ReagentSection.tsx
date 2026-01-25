import { memo, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";
import { useReagentData } from "@/hooks/useReagentData";
import type { ReagentResult } from "@/types/reagent";

interface ReagentSectionProps {
  article: SubstanceArticle;
}

// Standard reagent display order
const REAGENT_ORDER = [
  "marquis",
  "mecke",
  "mandelin",
  "simon",
  "robadope",
  "froehde",
  "liebermann",
  "ehrlich",
  "hofmann",
  "folin",
  "gallic",
  "scott",
];

// Map of common color names to hex values (matching reagentColors.ts palette)
const COLOR_NAME_TO_HEX: Record<string, string> = {
  // Whites/Grays/Blacks
  white: "#ffffff",
  clear: "#ffffff",
  colorless: "#ffffff",
  gray: "#666666",
  grey: "#666666",
  black: "#111111",
  // Blues
  blue: "#0067ce",
  "light blue": "#41a7f8",
  "dark blue": "#020f69",
  // Greens
  green: "#3f8a1f",
  "light green": "#7aefa6",
  "dark green": "#204a1c",
  olive: "#204a1c",
  // Yellows
  yellow: "#f0d41d",
  "pale yellow": "#ffffcc",
  gold: "#deb22e",
  amber: "#deb22e",
  // Oranges
  orange: "#fd7322",
  "dark orange": "#c04d01",
  // Reds
  red: "#ff0000",
  "light red": "#ff6666",
  "dark red": "#8c113e",
  maroon: "#8c113e",
  // Pinks
  pink: "#ff6fcf",
  "light pink": "#d59aca",
  // Purples
  purple: "#830c93",
  "light purple": "#8064a2",
  "dark purple": "#270d45",
  violet: "#50268d",
  // Browns
  brown: "#8e563a",
  "dark brown": "#51240b",
  tan: "#8e563a",
  // Creams
  cream: "#fde9d9",
  peach: "#fde9d9",
};

/**
 * Capitalize first letter of reagent name
 */
function capitalizeReagent(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Parse color names from a description string like "purple → black" or "yellow/orange"
 */
function parseColorsFromDescription(desc: string): string[] {
  const normalized = desc.toLowerCase().trim();

  // Check for "no reaction" variants
  if (
    normalized.includes("no reaction") ||
    normalized.includes("no change") ||
    normalized === "none" ||
    normalized === "n/a"
  ) {
    return ["#4a4a4a"];
  }

  // Split by arrows, slashes, commas, "to", or dashes
  const parts = normalized
    .split(/[→>/,-]|(?:\s+to\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const colors: string[] = [];

  for (const part of parts) {
    // Try exact match first
    if (COLOR_NAME_TO_HEX[part]) {
      colors.push(COLOR_NAME_TO_HEX[part]);
      continue;
    }

    // Try to find a color name within the part
    for (const [colorName, hex] of Object.entries(COLOR_NAME_TO_HEX)) {
      if (part.includes(colorName)) {
        colors.push(hex);
        break;
      }
    }
  }

  return colors.length > 0 ? colors : ["#666666"];
}

/**
 * Build a CSS gradient string from an array of colors
 */
function buildGradient(colors: string[]): string {
  if (colors.length === 1) return colors[0];
  return `linear-gradient(to right, ${colors.join(", ")})`;
}

/**
 * Build a darkened and desaturated gradient for the label section
 */
function buildDarkenedGradient(colors: string[]): string {
  const mutedColors = colors.map((hex) => {
    // Parse hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Calculate grayscale value
    const gray = (r + g + b) / 3;

    // Blend towards gray (desaturate by 50%) then darken by 60%
    const desatFactor = 0.5;
    const darkFactor = 0.4;

    const newR = Math.round((r * (1 - desatFactor) + gray * desatFactor) * darkFactor);
    const newG = Math.round((g * (1 - desatFactor) + gray * desatFactor) * darkFactor);
    const newB = Math.round((b * (1 - desatFactor) + gray * desatFactor) * darkFactor);

    return `rgb(${newR},${newG},${newB})`;
  });

  if (mutedColors.length === 1) return mutedColors[0];
  return `linear-gradient(to right, ${mutedColors.join(", ")})`;
}

/**
 * Get short code for reagent name
 */
function getReagentShortCode(name: string): string {
  const shortCodes: Record<string, string> = {
    marquis: "MQ",
    mecke: "ME",
    mandelin: "MD",
    simon: "SM",
    robadope: "RB",
    froehde: "FR",
    liebermann: "LB",
    ehrlich: "EH",
    hofmann: "HM",
    folin: "FO",
    gallic: "GA",
    scott: "SC",
  };
  return shortCodes[name.toLowerCase()] ?? name.slice(0, 2).toUpperCase();
}

/**
 * Single reagent result row - gradient bar design matching ReagentTestingSection
 */
function ReagentRow({
  reagent,
  description,
}: {
  reagent: string;
  description: string;
}) {
  const colors = parseColorsFromDescription(description);
  const gradient = buildGradient(colors);
  const darkenedGradient = buildDarkenedGradient(colors);
  const shortCode = getReagentShortCode(reagent);
  const isNoReaction =
    description.toLowerCase().includes("no reaction") ||
    description.toLowerCase().includes("no change") ||
    colors[0] === "#4a4a4a";

  return (
    <article
      className="relative flex h-12 items-center overflow-hidden rounded-xl transition hover:ring-1 hover:ring-fuchsia-400/50"
      style={{
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.25),
          inset 0 -1px 0 rgba(0,0,0,0.3),
          0 1px 3px rgba(0,0,0,0.2)
        `,
      }}
    >
      {/* Left label section - darkened gradient */}
      <div
        className="relative z-10 flex h-full flex-shrink-0 flex-col justify-center px-4"
        style={{
          background: darkenedGradient,
          boxShadow: "inset -1px 0 0 rgba(255,255,255,0.1), 2px 0 4px rgba(0,0,0,0.3)",
        }}
      >
        {/* Glassmorphic overlay for left section */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.12) 0%, transparent 40%, rgba(0,0,0,0.2) 100%)",
            borderTop: "1px solid rgba(255,255,255,0.15)",
            borderBottom: "1px solid rgba(0,0,0,0.3)",
          }}
        />
        <span className="relative text-sm font-semibold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
          {capitalizeReagent(reagent)}
          <span className="ml-1.5 font-normal text-white/50">({shortCode})</span>
        </span>
        <span
          className={`relative text-xs drop-shadow-[0_2px_4px_rgba(0,0,0,1)] ${isNoReaction ? "text-white/50" : "text-white/70"
            }`}
        >
          {description}
        </span>
      </div>

      {/* Right spectrum section - bright gradient */}
      <div className="relative h-full flex-1" style={{ background: gradient }}>
        {/* Glassmorphic overlay for depth on spectrum */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 40%, rgba(0,0,0,0.15) 100%)",
            borderTop: "1px solid rgba(255,255,255,0.2)",
            borderBottom: "1px solid rgba(0,0,0,0.25)",
          }}
        />
      </div>
    </article>
  );
}

const COLLAPSED_LIMIT = 4;

/**
 * Map API reagent keys to display names
 */
const REAGENT_KEY_TO_NAME: Record<string, string> = {
  marq_desc: "marquis",
  meck_desc: "mecke",
  mand_desc: "mandelin",
  simo_desc: "simon",
  roba_desc: "robadope",
  froh_desc: "froehde",
  lieb_desc: "liebermann",
  ehrl_desc: "ehrlich",
  hofm_desc: "hofmann",
  foli_desc: "folin",
  gall_desc: "gallic",
  scot_desc: "scott",
};

/**
 * Convert API response to entries format
 */
function convertApiToEntries(reagents: ReagentResult[]): [string, string][] {
  return reagents
    .map((result) => {
      const name = REAGENT_KEY_TO_NAME[result.reagent] || result.reagent.replace(/_desc$/, "");
      // Build description from colors
      const colorNames = result.colors.map((c) => c.name).join(" → ");
      const description = result.isReacting
        ? (colorNames || result.hint || "Reaction")
        : "No reaction";
      return [name, description] as [string, string];
    })
    .filter(([, desc]) => desc.length > 0);
}

export const ReagentSection = memo(function ReagentSection({
  article,
}: ReagentSectionProps) {
  const { reagent_testing } = article;
  const [isExpanded, setIsExpanded] = useState(false);

  // Get substance name and aliases for API lookup
  const substanceName = article.identification?.common_name || article.title || "";
  const aliases = article.identification?.alternative_names || [];

  // Check if we have static data
  const staticEntries = useMemo(() => {
    if (!reagent_testing) return [];
    return Object.entries(reagent_testing).filter(
      ([, value]) => value && value.trim().length > 0
    );
  }, [reagent_testing]);

  const hasStaticData = staticEntries.length > 0;

  // Fetch from API if no static data
  const { data: apiData, isLoading } = useReagentData(
    hasStaticData ? "" : substanceName, // Only fetch if no static data
    hasStaticData ? [] : aliases
  );

  // Convert API data to entries format
  const apiEntries = useMemo(() => {
    if (!apiData?.reagents) return [];
    return convertApiToEntries(apiData.reagents);
  }, [apiData]);

  // Use static data if available, otherwise API data
  const entries = hasStaticData ? staticEntries : apiEntries;

  // Show loading state only when fetching API data
  if (!hasStaticData && isLoading) {
    return (
      <div id="reagent-testing" className="space-y-6 pt-12 scroll-mt-6">
        <SectionHeader icon="lucide:pipette" title="Reagent Testing" />
        <div className="flex items-center justify-center py-8 text-white/50">
          <Icon icon="lucide:loader-2" size={20} className="mr-2 animate-spin" />
          Loading reagent data...
        </div>
      </div>
    );
  }

  // Don't render if no data (static or API) or API error with no static fallback
  if (entries.length === 0) {
    return null;
  }

  // Sort by standard order, with reacting reagents first
  const sortedEntries = entries.sort(([a, descA], [b, descB]) => {
    // Check if reagents are reacting
    const aNoReaction =
      descA.toLowerCase().includes("no reaction") ||
      descA.toLowerCase().includes("no change");
    const bNoReaction =
      descB.toLowerCase().includes("no reaction") ||
      descB.toLowerCase().includes("no change");

    // Reacting reagents first
    if (!aNoReaction && bNoReaction) return -1;
    if (aNoReaction && !bNoReaction) return 1;

    // Then by standard order
    const aIdx = REAGENT_ORDER.indexOf(a.toLowerCase());
    const bIdx = REAGENT_ORDER.indexOf(b.toLowerCase());
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  const hasMore = sortedEntries.length > COLLAPSED_LIMIT;
  const visibleEntries = isExpanded ? sortedEntries : sortedEntries.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = sortedEntries.length - COLLAPSED_LIMIT;

  return (
    <div id="reagent-testing" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:pipette" title="Reagent Testing" />

      <p className="text-sm text-white/60">
        Expected colorimetric results for common reagent tests. Colors show reaction
        change over 1–2 minutes.
      </p>

      <div className="space-y-3 rounded-xl bg-black/20 p-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
        {visibleEntries.map(([reagent, description]) => (
          <ReagentRow
            key={reagent}
            reagent={reagent}
            description={description}
          />
        ))}

        {/* Expand/Collapse button */}
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mx-auto flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
          >
            <span className="font-medium">+{hiddenCount}</span>
            <Icon icon="lucide:chevron-down" size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {/* Attribution footer */}
      <div className="mt-4 flex justify-end">
        <a
          href="https://protestkit.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex items-center gap-2.5 rounded-full bg-white/[0.04] pl-3 pr-4 py-1.5 ring-1 ring-white/10 hover:ring-fuchsia-400/30 hover:bg-white/[0.06] transition"
        >
          <span className="text-xs text-white/50 group-hover:text-white/60 transition">Powered by</span>
          <img src="/favicons/protestkit.png" alt="" className="h-5 w-5 rounded" />
          <span className="text-xs font-semibold text-fuchsia-200 group-hover:text-fuchsia-100 transition -ml-1">
            PROtestkit.eu
          </span>
          <Icon icon="lucide:external-link" size={12} className="text-white/30 group-hover:text-white/50 transition -ml-1" />
        </a>
      </div>
    </div>
  );
});
