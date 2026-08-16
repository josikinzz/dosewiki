"use client";

import { useEffect, useState } from "react";
import { loadIcon } from "@iconify/react";

import { Icon } from "@/components/common/Icon";
import { customIcons } from "@/components/common/customIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WARNING_BANNER_ICON_PATTERN,
  WARNING_BANNER_ICON_SUGGESTIONS,
  WARNING_BANNER_LIMITS,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";
import { EditorField } from "@/features/dev/components";
import { cn } from "@/lib/utils";

/**
 * Severity surfaces, keyed by tone. The gutter preview has to sit on the real
 * card background because an icon that reads at 16px on the panel can turn to
 * mush at 22px on a rose gradient, which is the whole reason this field shows a
 * preview at all (design brief §7b).
 */
const TONE_SURFACE_CLASS: Record<WarningBannerTone, string> = {
  danger: "theme-interaction-danger",
  unsafe: "theme-interaction-unsafe",
  caution: "theme-interaction-caution",
};

const TONE_BADGE_CLASS: Record<WarningBannerTone, string> = {
  danger: "theme-interaction-severity-badge-danger",
  unsafe: "theme-interaction-severity-badge-unsafe",
  caution: "theme-interaction-severity-badge-caution",
};

/**
 * `malformed` fails the shared pattern; `unknown` passes it but resolves to no
 * glyph. Both block save, and they are kept apart because the fix differs: one
 * is a shape mistake ("lucide wind"), the other a spelling mistake
 * ("lucide:wnid").
 */
type IconResolution = "empty" | "malformed" | "checking" | "valid" | "unknown";

const CUSTOM_PREFIX = "custom:";

/** Long enough that typing `lucide:triangle-alert` costs one API round trip. */
const RESOLVE_DEBOUNCE_MS = 350;

export type BannerIconFieldProps = {
  value: string;
  tone: WarningBannerTone;
  /** Shown beside the glyph in the preview, exactly as the banner renders it. */
  severityLabel: string;
  onChange: (icon: string) => void;
  /**
   * Raised whenever resolution settles. The parent hard-gates Save on it: this
   * is the one field where a typo is silent — `Icon` renders nothing at all for
   * an id the Iconify API does not know — so an invisible glyph on a safety
   * banner has to be caught here or it ships.
   */
  onValidityChange: (valid: boolean) => void;
};

export function BannerIconField({
  value,
  tone,
  severityLabel,
  onChange,
  onValidityChange,
}: BannerIconFieldProps) {
  const [resolution, setResolution] = useState<IconResolution>("checking");
  const trimmed = value.trim();

  useEffect(() => {
    if (!trimmed) {
      setResolution("empty");
      return;
    }

    if (!WARNING_BANNER_ICON_PATTERN.test(trimmed)) {
      setResolution("malformed");
      return;
    }

    if (trimmed.startsWith(CUSTOM_PREFIX)) {
      // `custom:` glyphs are React components compiled into the bundle
      // (`src/components/common/customIcons.tsx`), so map membership is the
      // whole check — there is no network round trip to debounce or await.
      setResolution(customIcons[trimmed.slice(CUSTOM_PREFIX.length)] ? "valid" : "unknown");
      return;
    }

    setResolution("checking");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      loadIcon(trimmed).then(
        () => {
          if (!cancelled) {
            setResolution("valid");
          }
        },
        () => {
          if (!cancelled) {
            setResolution("unknown");
          }
        },
      );
    }, RESOLVE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  useEffect(() => {
    onValidityChange(resolution === "valid");
  }, [resolution, onValidityChange]);

  const error =
    resolution === "malformed" ? (
      <>
        {"An Iconify id looks like "}
        <code className="font-mono">lucide:wind</code>
        {", or "}
        <code className="font-mono">custom:benzene</code>
        {" for one of this repo's own glyphs."}
      </>
    ) : resolution === "unknown" ? (
      <>
        {"No icon called "}
        <code className="font-mono">{trimmed}</code>
        {". Check the spelling or browse icones.js.org."}
      </>
    ) : resolution === "empty" ? (
      "Every banner renders a glyph in its gutter, so this field cannot be blank."
    ) : null;

  return (
    <EditorField
      label="Icon"
      description="Any Iconify id, resolved against the API before it can be saved."
      counter={
        resolution === "checking"
          ? "checking…"
          : resolution === "valid"
            ? "resolved"
            : `${trimmed.length}/${WARNING_BANNER_LIMITS.iconMaxLength}`
      }
      error={error}
      tone={error ? "danger" : "default"}
    >
      {(controlProps) => (
        <div className="space-y-3">
          <Input
            {...controlProps}
            value={value}
            inputSize="sm"
            variant={error ? "error" : "default"}
            maxLength={WARNING_BANNER_LIMITS.iconMaxLength}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="font-mono"
            placeholder="lucide:wind"
            onChange={(event) => onChange(event.target.value)}
          />

          <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", TONE_SURFACE_CLASS[tone])}>
            <span className="flex size-9 shrink-0 items-center justify-center">
              {resolution === "valid" ? (
                <Icon icon={trimmed} size={22} className="theme-interaction-icon" />
              ) : (
                <Icon
                  icon="lucide:image-off"
                  size={22}
                  className="theme-interaction-icon opacity-45"
                />
              )}
            </span>
            <div className="min-w-0 space-y-0.5">
              <span
                className={cn(
                  "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]",
                  TONE_BADGE_CLASS[tone],
                )}
              >
                {severityLabel.trim() || "Severity label"}
              </span>
              <p className="theme-text-faint text-xs">
                {`22px, in the gutter, on the ${tone} surface a reader sees.`}
              </p>
            </div>
          </div>

          <div>
            <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.16em]">
              Shortcuts — any Iconify id works
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {WARNING_BANNER_ICON_SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion.icon}
                  type="button"
                  variant={trimmed === suggestion.icon ? "pillActive" : "ghostPill"}
                  size="quiet"
                  title={`${suggestion.hint} — ${suggestion.icon}`}
                  aria-label={`Use ${suggestion.icon} (${suggestion.hint})`}
                  aria-pressed={trimmed === suggestion.icon}
                  onClick={() => onChange(suggestion.icon)}
                >
                  <Icon icon={suggestion.icon} size={16} />
                  <span className="theme-text-faint text-[11px]">{suggestion.hint}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </EditorField>
  );
}
