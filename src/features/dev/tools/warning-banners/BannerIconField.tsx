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
} from "@/data/substanceWarningBanners";
import { EditorField } from "@/features/dev/components";

/**
 * `malformed` fails the shared pattern; `unknown` passes it but resolves to no
 * glyph. Both block save, and they are kept apart because the fix differs: one
 * is a shape mistake (lucide wind), the other a spelling mistake
 * (lucide:wnid).
 */
type IconResolution = "empty" | "malformed" | "checking" | "valid" | "unknown";

const CUSTOM_PREFIX = "custom:";

/** Long enough that typing `lucide:triangle-alert` costs one API round trip. */
const RESOLVE_DEBOUNCE_MS = 350;

export type BannerIconFieldProps = {
  value: string;
  onChange: (icon: string) => void;
  /**
   * Raised whenever resolution settles. The parent hard-gates Save on it: this
   * is the one field where a typo is silent — `Icon` renders nothing at all for
   * an id the Iconify API does not know — so an invisible glyph on a safety
   * banner has to be caught here or it ships.
   */
  onValidityChange: (valid: boolean) => void;
};

/**
 * The icon field. No preview of its own: the full-width `SafetyBanner` at the top
 * of the drawer already renders this glyph at the saved global size on its real
 * tone surface, and a second smaller copy beside the input was noise. The
 * suggestion chips below are deliberately fixed-size — they are a shortcut list,
 * not a claim about how the glyph will read on an article.
 */
export function BannerIconField({ value, onChange, onValidityChange }: BannerIconFieldProps) {
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
      "The gutter glyph cannot be blank."
    ) : null;

  return (
    <EditorField
      label="Icon"
      description="Any Iconify id, resolved for real before it can be saved."
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
        <div className="space-y-2">
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

          {/* Glyph-only shortcuts. The hint rides on `title`/`aria-label`
              rather than a visible caption: ten labelled chips read as a
              whitelist and crowded out the field they sit under. */}
          <div className="flex flex-wrap gap-1.5">
            {WARNING_BANNER_ICON_SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion.icon}
                type="button"
                variant={trimmed === suggestion.icon ? "pillActive" : "ghostPill"}
                size="quiet"
                className="[@media(pointer:coarse)]:min-w-11"
                title={`${suggestion.hint}: ${suggestion.icon}`}
                aria-label={`Use ${suggestion.icon} (${suggestion.hint})`}
                aria-pressed={trimmed === suggestion.icon}
                onClick={() => onChange(suggestion.icon)}
              >
                <Icon icon={suggestion.icon} size={18} />
              </Button>
            ))}
          </div>
        </div>
      )}
    </EditorField>
  );
}
