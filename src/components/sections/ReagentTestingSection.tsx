import { ExternalLink, TestTubeDiagonal } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { useReagentData } from "../../hooks/useReagentData";
import { getReagentColorHex } from "../../constants/reagentColors";
import type { ReagentResult, ReagentColor } from "../../types/reagent";

interface ReagentTestingSectionProps {
  substanceName: string;
  aliases?: string[];
}

/**
 * Map reagent API names to user-friendly display names and short codes.
 */
const REAGENT_INFO: Record<string, { name: string; short: string }> = {
  marq_desc: { name: "Marquis", short: "MQ" },
  meck_desc: { name: "Mecke", short: "ME" },
  mand_desc: { name: "Mandelin", short: "MD" },
  lieb_desc: { name: "Liebermann", short: "LB" },
  ehrl_desc: { name: "Ehrlich", short: "EH" },
  hofm_desc: { name: "Hofmann", short: "HM" },
  simons_desc: { name: "Simon's", short: "SM" },
  roba_desc: { name: "Robadope", short: "RB" },
  froe_desc: { name: "Froehde", short: "FR" },
  gallic_desc: { name: "Gallic Acid", short: "GA" },
  scott_desc: { name: "Scott", short: "SC" },
  zimm_desc: { name: "Zimmermann", short: "ZM" },
  morr_desc: { name: "Morris", short: "MR" },
};

function getReagentDisplayName(reagentKey: string): string {
  return REAGENT_INFO[reagentKey]?.name ?? reagentKey.replace(/_desc$/, "");
}

function getReagentShortName(reagentKey: string): string {
  return REAGENT_INFO[reagentKey]?.short ?? reagentKey.slice(0, 2).toUpperCase();
}

/**
 * Build a CSS gradient string for the badge using all reaction colors.
 * Creates a left-to-right gradient through the color sequence.
 */
function getBadgeGradient(result: ReagentResult): string {
  const colors = result.colors || [];
  if (!result.isReacting || colors.length === 0) {
    return "#4a4a4a"; // Neutral gray for no reaction
  }
  const hexColors = colors.map(c => c.hex || getReagentColorHex(c.id));
  if (hexColors.length === 1) {
    return hexColors[0]; // Solid color for single-color reactions
  }
  return `linear-gradient(to right, ${hexColors.join(", ")})`;
}


/**
 * Check if a reagent result has valid data for rendering.
 */
function isValidReagentResult(result: unknown): result is ReagentResult {
  if (!result || typeof result !== "object") return false;
  const r = result as Record<string, unknown>;
  return typeof r.reagent === "string" && r.reagent.length > 0;
}

/**
 * Build a darkened and desaturated CSS gradient string for the label section.
 */
function getDarkenedGradient(result: ReagentResult): string {
  const colors = result.colors || [];
  if (!result.isReacting || colors.length === 0) {
    return "#2a2a2a"; // Darker neutral gray for no reaction
  }
  // Darken and desaturate each color
  const mutedHexColors = colors.map(c => {
    const hex = c.hex || getReagentColorHex(c.id);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Calculate grayscale value
    const gray = (r + g + b) / 3;
    // Blend towards gray (desaturate by 50%) then darken
    const desatFactor = 0.5; // 50% desaturation
    const darkFactor = 0.4;  // 60% darker
    const newR = Math.round((r * (1 - desatFactor) + gray * desatFactor) * darkFactor);
    const newG = Math.round((g * (1 - desatFactor) + gray * desatFactor) * darkFactor);
    const newB = Math.round((b * (1 - desatFactor) + gray * desatFactor) * darkFactor);
    return `rgb(${newR},${newG},${newB})`;
  });
  if (mutedHexColors.length === 1) {
    return mutedHexColors[0];
  }
  return `linear-gradient(to right, ${mutedHexColors.join(", ")})`;
}

/**
 * Single reagent result row - gradient bar design with glassmorphic edges.
 */
function ReagentRow({ result }: { result: ReagentResult }) {
  const reagentKey = result.reagent || "";
  const displayName = getReagentDisplayName(reagentKey);
  const barGradient = getBadgeGradient(result);
  const darkenedGradient = getDarkenedGradient(result);
  const shortName = getReagentShortName(reagentKey);
  const hintText = result.hint || (!result.isReacting ? "No reaction" : "");

  return (
    <article
      className="relative flex h-12 items-center overflow-hidden rounded-xl transition hover:ring-fuchsia-400/50"
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
            background: "linear-gradient(to bottom, rgba(255,255,255,0.12) 0%, transparent 40%, rgba(0,0,0,0.2) 100%)",
            borderTop: "1px solid rgba(255,255,255,0.15)",
            borderBottom: "1px solid rgba(0,0,0,0.3)",
          }}
        />
        <span className="relative text-sm font-semibold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
          {displayName}
          <span className="ml-1.5 font-normal text-white/50">({shortName})</span>
        </span>
        {hintText && (
          <span className="relative text-xs text-white/70 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">{hintText}</span>
        )}
      </div>

      {/* Right spectrum section */}
      <div
        className="relative flex-1 h-full"
        style={{ background: barGradient }}
      >
        {/* Glassmorphic overlay for depth on spectrum */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 40%, rgba(0,0,0,0.15) 100%)",
            borderTop: "1px solid rgba(255,255,255,0.2)",
            borderBottom: "1px solid rgba(0,0,0,0.25)",
          }}
        />
      </div>
    </article>
  );
}

/**
 * Loading skeleton while fetching from API.
 */
function LoadingSkeleton() {
  return (
    <SectionCard delay={0.2}>
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
          <IconBadge icon={TestTubeDiagonal} label="Reagent Testing" />
          Reagent Testing
        </h2>
      </div>
      <div className="mt-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-xl bg-white/5"
          />
        ))}
      </div>
    </SectionCard>
  );
}

/**
 * Reagent Testing Section component.
 * Fetches and displays colorimetric reagent test results from ProtestKit API.
 */
export function ReagentTestingSection({
  substanceName,
  aliases = [],
}: ReagentTestingSectionProps) {
  const { data, isLoading } = useReagentData(substanceName, aliases);

  // Show loading skeleton while fetching
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Hide section if no data or no reagents
  if (!data || !data.reagents || data.reagents.length === 0) {
    return null;
  }

  return (
    <SectionCard delay={0.2}>
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
          <IconBadge icon={TestTubeDiagonal} label="Reagent Testing" />
          Reagent Testing
        </h2>
        <p className="text-sm text-white/60">
          Expected colorimetric results for common reagent tests. Colors show reaction change over 1–2 minutes.
        </p>
      </div>

      <div className="scrollbar-always-visible mt-6 max-h-[400px] space-y-3 overflow-y-scroll rounded-xl bg-black/20 p-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
        {data.reagents
          .filter(isValidReagentResult)
          .sort((a, b) => {
            // Reacting reagents first
            if (a.isReacting && !b.isReacting) return -1;
            if (!a.isReacting && b.isReacting) return 1;
            return 0;
          })
          .map((result) => (
            <ReagentRow key={result.reagent} result={result} />
          ))}
      </div>

      {/* Attribution footer */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="text-xs text-white/50">Powered by</span>
        <a
          href="https://protestkit.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-fuchsia-200 transition hover:text-fuchsia-100"
        >
          ProtestKit.eu
        </a>
        <ExternalLink className="h-3 w-3 text-white/40" aria-hidden="true" />
      </div>
    </SectionCard>
  );
}
